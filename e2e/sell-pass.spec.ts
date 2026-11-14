import type { Page } from '@playwright/test';
import {
  expect,
  loginToReception,
  quickSearchRow,
  scanBarcode,
  SELL_MODAL_TITLE,
  sellToIdentifiedGuest,
  test,
  toasts,
} from './fixtures';

const DAY_TICKET_ROW_TEXT = '1 Alkalmas Napijegy';

/** A recepció „Mai kassza” kártyája. */
function cashSummary(page: Page) {
  return page
    .locator('div')
    .filter({ hasText: 'Mai kassza' })
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
    await expect(page.getByRole('heading', { name: 'Szabó Eszter', level: 3 })).toBeVisible();

    await page.getByRole('button', { name: 'Új bérlet eladása' }).click();
    await expect(page.getByText('Vendég: Szabó Eszter (100003)')).toBeVisible();
    // TICKET-4: az azonosított vendég előre ki van választva, de a választóban módosítható.
    await expect(page.getByRole('button', { name: /^Szabó Eszter/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Mégse' }).click();

    await sellToIdentifiedGuest(page, /^1 Alkalmas Napijegy/, 'Készpénz');

    await expect(cashSummary(page)).toContainText('95 500 Ft');
    await expect(cashSummary(page)).toContainText('16 500 Ft');
    await expect(quickSearchRow(page, '100003')).toContainText(DAY_TICKET_ROW_TEXT);
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
  test('TICKET-4: gyorsgombról nyitva vendéget kell választani, és az eladás a kiválasztott vendéghez kerül', async ({
    page,
  }) => {
    await loginToReception(page);
    await page.getByRole('button', { name: 'Új bérlet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: SELL_MODAL_TITLE });
    await expect(dialog).toBeVisible();

    // Vendég nélkül nem lehet eladni, és nincs automatikusan kiválasztott vendég.
    await expect(page.getByText(/^Vendég: Kovács Anna/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Bérlet Eladása & Fizetés' })).toBeDisabled();
    await expect(dialog).toContainText('Bérlet csak kiválasztott vendégnek adható el.');

    // Kereshető vendégválasztó: telefonszámra is talál (Szabó Eszter: +36 20 981 1140).
    const search = dialog.getByRole('searchbox', { name: 'Vendég' });
    await search.fill('20 981');
    await expect(dialog.getByRole('button', { name: /^Szabó Eszter/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Kovács Anna/ })).toHaveCount(0);

    await search.fill('Szabó');
    await dialog.getByRole('button', { name: /^Szabó Eszter/ }).click();
    await expect(dialog.getByRole('button', { name: /^Szabó Eszter/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('Vendég: Szabó Eszter (100003)')).toBeVisible();

    await dialog.getByRole('button', { name: /^1 Alkalmas Napijegy/ }).click();
    await dialog.getByRole('button', { name: 'Bérlet Eladása & Fizetés' }).click();
    await expect(dialog).toBeHidden();

    await expect(toasts(page)).toContainText('Szabó Eszter');
    await expect(quickSearchRow(page, '100003')).toContainText(DAY_TICKET_ROW_TEXT);
    await expect(quickSearchRow(page, '100001')).not.toContainText(DAY_TICKET_ROW_TEXT);
  });
});
