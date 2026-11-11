import { E2E_LOGIN_CODE, E2E_STAFF_EMAIL, expect, requestLoginCode, test } from './fixtures';

test.describe('TICKET-35 Belépés e-mailben küldött kóddal', () => {
  test('a kódlépés a címet és a demókódot mutatja, a kóddal belép', async ({ page }) => {
    await requestLoginCode(page);

    await expect(page.getByText(`Elküldtük a belépőkódot ide: ${E2E_STAFF_EMAIL}`)).toBeVisible();
    await expect(page.getByText(`A belépőkód: ${E2E_LOGIN_CODE}`)).toBeVisible();
    await expect(page.getByLabel('Belépőkód')).toHaveAttribute('autocomplete', 'one-time-code');

    await page.getByLabel('Belépőkód').fill(E2E_LOGIN_CODE);
    await page.getByRole('button', { name: 'Belépés', exact: true }).click();
    await expect(page).toHaveURL(/\/reception$/);
  });

  test('hibás és hiányos kódra érthető hibát ad, és nem lép be', async ({ page }) => {
    await requestLoginCode(page);
    const codeInput = page.getByLabel('Belépőkód');
    const submit = page.getByRole('button', { name: 'Belépés', exact: true });

    await codeInput.fill('12a3');
    await expect(codeInput).toHaveValue('123');
    await submit.click();
    await expect(page.getByText('A belépőkód 6 számjegyből áll.')).toBeVisible();

    await codeInput.fill('999999');
    await submit.click();
    await expect(page.getByRole('alert')).toContainText('Hibás vagy lejárt belépőkód');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('új kód kérése és másik e-mail cím', async ({ page }) => {
    await requestLoginCode(page);

    await page.getByRole('button', { name: 'Új kód kérése' }).click();
    await expect(page.getByText('Új kódot küldtünk. A korábbi kód már nem érvényes.')).toBeVisible();

    await page.getByRole('button', { name: 'Másik e-mail cím' }).click();
    await expect(page.getByLabel('E-mail cím')).toHaveValue(E2E_STAFF_EMAIL);
    await expect(page.getByRole('button', { name: 'Kód küldése' })).toBeVisible();
  });
});
