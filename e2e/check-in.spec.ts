import {
  deductTreatment,
  expect,
  loginToReception,
  quickSearchRow,
  scanBarcode,
  sellToIdentifiedGuest,
  test,
  toasts,
} from './fixtures';

const ARRIVAL_LOG_WITH_ONE_NEW = /Mai érkezések és kezelések \(2\)/;

test.describe('Beléptetés vonalkóddal', () => {
  test.beforeEach(async ({ page }) => {
    await loginToReception(page);
  });

  test('havi tagos vendég köredzésre levonás nélkül lép be', async ({ page }) => {
    // Kovács Anna (#100001): aktív havi tagság + 10 alkalmas Hypoxi bérlet (7 alk.)
    const row = quickSearchRow(page, '100001');
    await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (7 alk.)');

    await scanBarcode(page, '100001');

    await expect(toasts(page)).toContainText('Köredzés érkezés: Kovács Anna');
    await expect(page.getByRole('heading', { name: 'Kovács Anna', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: ARRIVAL_LOG_WITH_ONE_NEW })).toBeVisible();
    await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (7 alk.)');
  });

  test('ismétlő leolvasás 10 mp-en belül nem léptet be újra', async ({ page }) => {
    await scanBarcode(page, '100001');
    await expect(toasts(page)).toContainText('Köredzés érkezés: Kovács Anna');

    await scanBarcode(page, '100001');
    await expect(toasts(page)).toContainText('Dupla leolvasás védelem');
    await expect(page.getByRole('heading', { name: ARRIVAL_LOG_WITH_ONE_NEW })).toBeVisible();
  });

  test('ismeretlen vonalkódnál nincs beléptetés', async ({ page }) => {
    await scanBarcode(page, '999999');
    await expect(toasts(page)).toContainText('999999');
    await expect(page.getByText('Még nem történt vendégazonosítás ebben a munkamenetben.')).toBeVisible();
  });

  test('kezelés levonása 1 alkalmat von le a bérletről', async ({ page }) => {
    await deductTreatment(page, '100001');

    await expect(toasts(page)).toContainText('Kezelés levonva: Kovács Anna');
    await expect(quickSearchRow(page, '100001')).toContainText('10 Alkalmas Hypoxi Bérlet (6 alk.)');
  });
});

test.describe('Regresszió: TICKET-1', () => {
  test.fixme(
    'TICKET-1: alkalmas bérletnél vonalkódos beléptetéskor levonódik 1 alkalom',
    async ({ page }) => {
      await loginToReception(page);

      // Varga Judit (#100005): nincs havi tagság, a bérlete kimerült (0 alk.).
      // Elutasított beléptetés után a kártyáról új alkalmas bérletet adunk el neki.
      await scanBarcode(page, '100005');
      await expect(toasts(page)).toContainText('Belépés elutasítva: Varga Judit');
      await sellToIdentifiedGuest(page, /^10 Alkalmas Hypoxi Bérlet/);
      const row = quickSearchRow(page, '100005');
      await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (10 alk.)');

      // Csak alkalmas bérlet van: a vonalkódos beléptetésnek 1 alkalmat kell levonnia.
      await scanBarcode(page, '100005');
      await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (9 alk.)');
    },
  );
});
