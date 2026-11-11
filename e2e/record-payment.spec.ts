import type { Page } from '@playwright/test';
import { expect, loginToReception, test, toasts } from './fixtures';

const PAYMENT_MODAL_TITLE = 'Befizetés rögzítése';
const SUBMIT_LABEL = 'Befizetés rögzítése';

function paymentDialog(page: Page) {
  return page.getByRole('dialog', { name: PAYMENT_MODAL_TITLE });
}

function amountInput(page: Page) {
  return paymentDialog(page).getByLabel('Fizetett összeg (Ft)');
}

async function submitPayment(page: Page) {
  await paymentDialog(page).getByRole('button', { name: SUBMIT_LABEL }).click();
}

// TICKET-25: a `step={100}` miatt csak 1, 101, 201 … Ft volt érvényes, a kerek összegnél
// a „Befizetés rögzítése” gomb csendben nem csinált semmit.
test.describe('Regresszió: TICKET-25 befizetés kerek összeggel', () => {
  test.beforeEach(async ({ page }) => {
    await loginToReception(page);
  });

  test('TICKET-25: 3000 Ft „Egyéb” befizetés a Recepcióról', async ({ page }) => {
    await page.getByRole('button', { name: 'Befizetés', exact: true }).click();
    await expect(paymentDialog(page)).toBeVisible();

    await paymentDialog(page).getByRole('radio', { name: 'Egyéb' }).click();
    await amountInput(page).fill('3000');
    await submitPayment(page);

    await expect(paymentDialog(page)).toBeHidden();
    await expect(toasts(page)).toContainText('Befizetés rögzítve');
    await expect(toasts(page)).toContainText('3 000 Ft');
  });

  test('TICKET-25: a tartozás előre kitöltött 22 000 Ft-os tagdíja rögzíthető a Pénzügy oldalon', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Pénzügy' }).click();
    await expect(page).toHaveURL(/\/finance$/);

    // Nagy Péter (#100002): 3 napja lejárt, 22 000 Ft-os havi tagdíj.
    await page.getByRole('button', { name: 'Nagy Péter befizetésének rögzítése' }).first().click();
    await expect(paymentDialog(page)).toBeVisible();
    await expect(amountInput(page)).toHaveValue('22000');

    await submitPayment(page);

    await expect(paymentDialog(page)).toBeHidden();
    await expect(toasts(page)).toContainText('Befizetés rögzítve: Nagy Péter');
    await expect(toasts(page)).toContainText('22 000 Ft');
  });

  test('TICKET-25: 0 Ft-nál hibaüzenet jelenik meg, és nem történik rögzítés', async ({ page }) => {
    await page.getByRole('button', { name: 'Befizetés', exact: true }).click();
    await amountInput(page).fill('0');
    await submitPayment(page);

    await expect(paymentDialog(page)).toBeVisible();
    await expect(amountInput(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(paymentDialog(page)).toContainText('A fizetett összeg legalább 1 Ft-os egész szám legyen.');
    await expect(amountInput(page)).toBeFocused();
  });
});
