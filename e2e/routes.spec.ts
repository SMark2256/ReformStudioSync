import { expect, expectMonitorIdle, loginToReception, test } from './fixtures';

test.describe('Közvetlen linkek frissítéskor', () => {
  test('/ a belépőoldalra irányít, frissítés után is', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Kód küldése' })).toBeVisible();
  });

  test('/login frissítés után is betölt', async ({ page }) => {
    await page.goto('/login');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ReformStudioSync' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Interaktív Demo/ })).toBeVisible();
  });

  test('/monitor belépés nélkül a párosító nézetet mutatja, frissítés után is', async ({ page }) => {
    await page.goto('/monitor');
    await page.reload();
    await expect(page.getByText('Önálló Vendégmonitor & Tablet Kijelző')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Megszakítás / Belépés' })).toBeVisible();
  });

  test('/monitor belépés után a vendégkijelzőt mutatja, frissítés után is', async ({ page }) => {
    await loginToReception(page);
    await page.goto('/monitor');
    await page.reload();
    await expectMonitorIdle(page);
  });

  test('/demo frissítés után is betölt a demóadatokkal', async ({ page }) => {
    await page.goto('/demo');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Interaktív Demo & Tesztkörnyezet/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kovács Anna', exact: true })).toBeVisible();
  });

  test('/reception frissítés után is a recepciós pultot mutatja', async ({ page }) => {
    await loginToReception(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Vonalkódos beléptetés' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Bejelentkezett felhasználó' })).toContainText('ReformStudio Adminisztrátor');
  });
});
