import type { Page } from '@playwright/test';
import { expect, loginToReception, test, toasts } from './fixtures';

// Levelezés (TICKET-55), mock módban: a demóadatokban Kovács Anna, Nagy Péter és Szabó Eszter
// járult hozzá a marketing levelekhez.

async function openMailing(page: Page, tab?: string) {
  await loginToReception(page);
  await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Levelezés' }).click();
  await expect(page.getByRole('heading', { name: 'Levelezés', level: 1 })).toBeVisible();
  if (tab) await page.getByRole('radio', { name: tab }).click();
}

const recipients = (page: Page) => page.getByRole('table', { name: 'A levél címzettjei' });

test.describe('Levelezés', () => {
  test('új sablon élő előnézettel, mentés után a listában', async ({ page }) => {
    await openMailing(page);
    await page.getByRole('button', { name: 'Új sablon' }).click();

    await page.getByLabel('Sablon neve').fill('Novemberi ajánlat');
    await page.getByLabel('Tárgy').fill('Ajánlat neked, {{keresztnev}}');
    const editor = page.getByRole('textbox', { name: 'Szöveg' });
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Most 20% kedvezmény, {{teljes_nev}}.');

    await expect(page.getByTestId('email-preview-subject')).toHaveText('Ajánlat neked, Anna');
    const preview = page.frameLocator('iframe[title="A levél előnézete"]');
    await expect(preview.getByText('Kedves Anna!')).toBeVisible();
    await expect(preview.getByText(/Most 20% kedvezmény, Kovács Anna\./)).toBeVisible();

    // Elírt mezőnév: figyelmeztet.
    await page.getByLabel('Tárgy').fill('Ajánlat, {{kersztnev}}');
    await expect(page.getByText('Ismeretlen mező: {{kersztnev}}')).toBeVisible();
    await page.getByLabel('Tárgy').fill('Ajánlat neked, {{keresztnev}}');

    await page.getByRole('button', { name: 'Mentés' }).click();
    await expect(toasts(page)).toContainText('„Novemberi ajánlat” sablon mentve.');
    await expect(page.getByRole('table', { name: 'E-mail-sablonok' })).toContainText('Novemberi ajánlat');
  });

  test('csoportos küldés: címzettlista a szűrő szerint, küldés után a naplóban', async ({ page }) => {
    await openMailing(page, 'Csoportos küldés');

    await expect(recipients(page)).toContainText('Kovács Anna');
    await expect(recipients(page)).toContainText('Nagy Péter');
    await expect(page.getByTestId('bulk-audience-summary')).toContainText('3 címzett kapja meg');

    await page.getByRole('radio', { name: 'Soha nem volt' }).click();
    await expect(recipients(page)).toContainText('Nincs címzett a szűrő szerint.');
    await expect(page.getByRole('button', { name: 'Küldés', exact: true })).toBeDisabled();
    await page.getByRole('radio', { name: 'Mindegy' }).click();
    await expect(recipients(page)).toContainText('Kovács Anna');

    await page.getByRole('combobox', { name: 'Sablon betöltése' }).click();
    await page.getByRole('option', { name: 'Születésnapi köszöntő' }).click();
    await expect(page.getByTestId('email-preview-subject')).toHaveText('Boldog születésnapot, Anna!');

    await page.getByRole('button', { name: 'Küldés', exact: true }).click();
    await page.getByRole('button', { name: 'Küldés 3 címzettnek' }).click();
    await expect(toasts(page)).toContainText('3 levél a kimenő sorban.');

    await page.getByRole('radio', { name: 'Elküldött e-mailek' }).click();
    const log = page.getByRole('table', { name: 'Elküldött e-mailek' });
    await expect(log).toContainText('Boldog születésnapot, Anna!');
    await expect(log).toContainText('Csoportos levél');
    await expect(log).toContainText('Elküldve');
  });

  test('leiratkozó oldal: belépés nélkül, utána a vendég kimarad a csoportos küldésből', async ({ page }) => {
    await page.goto('/leiratkozas/demo-guest-1');
    await expect(page.getByRole('heading', { name: 'Leiratkozás', level: 1 })).toBeVisible();
    await expect(page.getByText(/Kedves Anna, ha nem szeretnél több hírlevelet/)).toBeVisible();
    await page.getByRole('button', { name: 'Leiratkozás' }).click();
    await expect(page.getByTestId('unsubscribe-done')).toContainText('Kedves Anna, leiratkoztál.');

    await page.reload();
    await expect(page.getByTestId('unsubscribe-done')).toBeVisible();

    await page.goto('/leiratkozas/demo-nincs-ilyen');
    await expect(page.getByText('A leiratkozó link érvénytelen vagy elavult.')).toBeVisible();

    await openMailing(page, 'Csoportos küldés');
    await expect(recipients(page)).toContainText('Nagy Péter');
    await expect(recipients(page)).not.toContainText('Kovács Anna');
    await expect(page.getByTestId('bulk-audience-summary')).toContainText('2 címzett kapja meg');
  });
});
