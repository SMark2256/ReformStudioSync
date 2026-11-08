import type { Page } from '@playwright/test';
import { expect, loginToReception, quickSearchRow, scanBarcode, test, toasts } from './fixtures';

const NEW_GUEST = { lastName: 'Teszt', firstName: 'Elek', barcode: '200001' };
const NEW_GUEST_NAME = `${NEW_GUEST.lastName} ${NEW_GUEST.firstName}`;

/** Az „Új Vendég Regisztrálása” űrlap kitöltése és mentése (a recepción és a /demo oldalon azonos). */
async function createGuest(page: Page) {
  await expect(page.getByRole('heading', { name: 'Új Vendég Regisztrálása' })).toBeVisible();
  await page.getByPlaceholder('Pl. Kovács').fill(NEW_GUEST.lastName);
  await page.getByPlaceholder('Pl. Anna').fill(NEW_GUEST.firstName);
  await page.getByPlaceholder('Üres = Automatikus').fill(NEW_GUEST.barcode);
  await page.getByRole('button', { name: 'Vendég Létrehozása' }).click();
  await expect(page.getByRole('heading', { name: 'Új Vendég Regisztrálása' })).toBeHidden();
}

/** A /demo szimulátor panelje („1. Köredzés … Szimulátor”). */
function demoSimulator(page: Page) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: /Kezelés Levonás \(2\.4\) Szimulátor/ }) })
    .filter({ has: page.getByRole('button', { name: /#100001/ }) })
    .last();
}

test.describe('Új vendég felvétele', () => {
  test('a recepción felvett vendég azonnal megjelenik és beolvasható', async ({ page }) => {
    await loginToReception(page);
    await page.getByRole('button', { name: /5\. Új vendég/ }).click();
    await createGuest(page);

    const row = quickSearchRow(page, NEW_GUEST.barcode);
    await expect(row.getByRole('button', { name: NEW_GUEST_NAME, exact: true })).toBeVisible();
    await expect(row).toContainText('Nincs aktív bérlet');

    // Bérlet nélkül a beolvasás azonosít, de nem léptet be.
    await scanBarcode(page, NEW_GUEST.barcode);
    await expect(toasts(page)).toContainText(`Belépés elutasítva: ${NEW_GUEST_NAME}`);
    await expect(page.getByRole('heading', { name: NEW_GUEST_NAME, level: 4 })).toBeVisible();
  });

  test('a /demo oldalon felvett vendég megjelenik a vendéglistában', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: /Új Tesztvendég/ }).click();
    await createGuest(page);
    await expect(page.getByRole('button', { name: NEW_GUEST_NAME, exact: true })).toBeVisible();
  });
});

test.describe('Regresszió: TICKET-3', () => {
  test.fixme(
    'TICKET-3: új vendég felvétele után azonnal kiválasztható a beléptető szimulátorban',
    async ({ page }) => {
      await page.goto('/demo');
      await page.getByRole('button', { name: /Új Tesztvendég/ }).click();
      await createGuest(page);

      await expect(demoSimulator(page)).toContainText(NEW_GUEST_NAME);
    },
  );

  test.fixme(
    'TICKET-3: más fülön (recepción) felvett vendég újratöltés nélkül megjelenik a /demo oldalon',
    async ({ page, context }) => {
      await page.goto('/demo');
      await expect(page.getByRole('button', { name: 'Kovács Anna', exact: true })).toBeVisible();

      const reception = await context.newPage();
      await loginToReception(reception);
      await reception.getByRole('button', { name: /5\. Új vendég/ }).click();
      await createGuest(reception);

      await page.bringToFront();
      await expect(page.getByRole('button', { name: NEW_GUEST_NAME, exact: true })).toBeVisible();
      await expect(demoSimulator(page)).toContainText(NEW_GUEST_NAME);
    },
  );
});
