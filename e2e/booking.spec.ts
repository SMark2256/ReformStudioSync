import type { Locator, Page } from '@playwright/test';
import { expect, loginToReception, test, toasts } from './fixtures';

// Online időpontfoglalás (TICKET-57), mock módban. A demóadatokban a következő nyitvatartási
// napon (ma, ha nyitva vagyunk) Kovács Anna Hypoxi Trainer 9:00 és Szabó Eszter Ceragem 10:00.
// A teszt a valós órát használja, ezért a napot lépteti, amíg talál szabad időpontot / foglalást.

async function stepUntilVisible(target: Locator, next: Locator, maxSteps = 10) {
  for (let i = 0; i < maxSteps; i++) {
    const found = await target
      .waitFor({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return;
    await next.click();
  }
  await expect(target).toBeVisible();
}

async function openBookings(page: Page) {
  await loginToReception(page);
  await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Foglalások' }).click();
  await expect(page.getByRole('heading', { name: 'Foglalások', level: 1 })).toBeVisible();
}

async function openBooking(page: Page, name: RegExp) {
  const booking = page.getByRole('button', { name }).first();
  await stepUntilVisible(booking, page.getByRole('button', { name: 'Következő', exact: true }));
  await booking.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Online foglalás', () => {
  test('nyilvános foglalás munkatársi belépés nélkül, kezelőlinkkel', async ({ page }) => {
    await page.goto('/foglalas');
    await expect(page.getByRole('heading', { name: 'Időpontfoglalás', level: 1 })).toBeVisible();

    await page.getByLabel('Flabelos (10 perc)').check();
    const slots = page.getByRole('group', { name: 'Szabad időpontok' });
    await stepUntilVisible(slots, page.getByRole('button', { name: 'Következő nap' }));
    await slots.getByRole('button').first().click();

    // Kötelező mezők nélkül nem megy át.
    await page.getByRole('button', { name: 'Foglalás véglegesítése' }).click();
    await expect(page.getByText('A foglaláshoz el kell fogadni az adatkezelési tájékoztatót.')).toBeVisible();

    await page.getByLabel('Vezetéknév').fill('Teszt');
    await page.getByLabel('Keresztnév').fill('Online');
    await page.getByLabel('E-mail cím').fill('online.foglalo@example.com');
    await page.getByLabel('Telefonszám').fill('+36301234567');
    await page.getByLabel(/Elfogadom az adatkezelési tájékoztatót/).check();
    await page.getByRole('button', { name: 'Foglalás véglegesítése' }).click();

    await expect(page.getByRole('heading', { name: 'Foglalás rögzítve', level: 1 })).toBeVisible();
    await expect(page.getByText(/Flabelos/)).toBeVisible();
    await page.getByRole('link', { name: 'Foglalás kezelése' }).click();
    await expect(page).toHaveURL(/\/foglalas\/kezeles\//);
    await expect(page.getByRole('heading', { name: 'Foglalás kezelése', level: 1 })).toBeVisible();
    await expect(page.getByText(/Flabelos/).first()).toBeVisible();
  });

  test('áthelyezés a recepciós naptárban', async ({ page }) => {
    await openBookings(page);
    const dialog = await openBooking(page, /^Szabó Eszter, Ceragem/);

    await dialog.getByRole('button', { name: 'Áthelyezés', exact: true }).click();
    await dialog.getByLabel(/Időkorlát felülírása/).check();
    // A következő napok egyikén biztosan van szabad Ceragem időpont.
    const dayInput = dialog.getByLabel('Új nap');
    const slots = dialog.getByRole('group', { name: 'Szabad időpontok az áthelyezéshez' });
    const start = new Date();
    for (let i = 1; i <= 10 && !(await slots.isVisible()); i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      await dayInput.fill(d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Budapest' }));
      await slots.or(dialog.getByText('Ezen a napon nincs szabad időpont.')).first().waitFor();
    }
    await slots.getByRole('button').first().click();
    await dialog.getByRole('button', { name: 'Áthelyezés mentése' }).click();

    await expect(toasts(page)).toContainText('Szabó Eszter áthelyezve');
  });

  test('„Nem jelent meg” rögzítése, majd visszaállítás', async ({ page }) => {
    await openBookings(page);
    const dialog = await openBooking(page, /^Kovács Anna, Hypoxi Trainer/);

    await dialog.getByRole('button', { name: 'Nem jelent meg', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Nem jelent meg rögzítése' }).click();
    await expect(toasts(page)).toContainText('Kovács Anna: Hypoxi Trainer, „Nem jelent meg”');
    await expect(dialog.getByText('Nem jelent meg', { exact: true }).first()).toBeVisible();

    await dialog.getByRole('button', { name: 'Visszaállítás' }).click();
    await expect(toasts(page)).toContainText('állapot visszaállítva');
    await expect(dialog.getByText('Nincs levonás', { exact: false })).toBeVisible();
  });
});
