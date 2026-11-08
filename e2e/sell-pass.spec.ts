import type { Page } from '@playwright/test';
import {
  expect,
  loginToReception,
  scanBarcode,
  SELL_MODAL_TITLE,
  sellToIdentifiedGuest,
  test,
  toasts,
} from './fixtures';

/** A recepció „Mai Kassza Gyorsösszesítő” kártyája. */
function cashSummary(page: Page) {
  return page
    .locator('div')
    .filter({ hasText: 'Mai Kassza Gyorsösszesítő' })
    .filter({ hasText: 'Készpénz' })
    .last();
}

test.describe('Bérlet / napijegy eladása', () => {
  test.beforeEach(async ({ page }) => {
    await loginToReception(page);
    await expect(cashSummary(page)).toContainText('89 000 Ft');
  });

  test('napijegy eladása az azonosított vendégnek készpénzzel', async ({ page }) => {
    await scanBarcode(page, '100003');
    await expect(page.getByRole('heading', { name: 'Szabó Eszter', level: 4 })).toBeVisible();

    await page.getByRole('button', { name: 'Új Bérlet Eladása' }).click();
    await expect(page.getByText('Vendég: Szabó Eszter (100003)')).toBeVisible();
    await page.getByRole('button', { name: 'Mégse' }).click();

    await sellToIdentifiedGuest(page, /^1 Alkalmas Napijegy/, 'Készpénz');

    await expect(cashSummary(page)).toContainText('95 500 Ft');
    await expect(cashSummary(page)).toContainText('16 500 Ft');
  });

  test('alkalmas bérlet eladása kártyával a kimerült bérletű vendégnek', async ({ page }) => {
    // Varga Judit (#100005): 0 alkalom maradt, beolvasáskor elutasítva.
    await scanBarcode(page, '100005');
    await expect(toasts(page)).toContainText('Belépés elutasítva: Varga Judit');

    await sellToIdentifiedGuest(page, /^10 Alkalmas Hypoxi Bérlet/, 'Bankkártya (POS)');

    await expect(cashSummary(page)).toContainText('168 000 Ft');
  });
});

test.describe('Regresszió: TICKET-4', () => {
  test.fixme(
    'TICKET-4: gyorsgombról nyitva vendéget kell választani, és az eladás a kiválasztott vendéghez kerül',
    async ({ page }) => {
      await loginToReception(page);
      await page.getByRole('button', { name: /3\. Új bérlet/ }).click();
      await expect(page.getByRole('heading', { name: SELL_MODAL_TITLE })).toBeVisible();

      // Vendég nélkül nem lehet eladni, és nincs automatikusan kiválasztott vendég.
      await expect(page.getByText(/^Vendég: Kovács Anna/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Bérlet Eladása & Fizetés' })).toBeDisabled();

      // Kereshető vendégválasztó (név / vonalkód / telefon). A pontos szerepet a javítás dönti el.
      await page.getByRole('combobox').or(page.getByRole('searchbox')).first().fill('Szabó');
      await page
        .getByRole('option', { name: /Szabó Eszter/ })
        .or(page.getByRole('button', { name: /Szabó Eszter/ }))
        .first()
        .click();
      await page.getByRole('button', { name: /^1 Alkalmas Napijegy/ }).click();
      await page.getByRole('button', { name: 'Bérlet Eladása & Fizetés' }).click();

      await expect(toasts(page)).toContainText('Szabó Eszter');
    },
  );
});
