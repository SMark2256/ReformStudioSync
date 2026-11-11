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

test.describe('Regresszió: TICKET-1, TICKET-39', () => {
  test(
    'TICKET-39: alkalmas bérletnél a beolvasás nem léptet be ingyen, hanem a kezelésválasztó nyílik meg; a megerősítés 1 alkalmat von le',
    async ({ page }) => {
      await loginToReception(page);

      // Varga Judit (#100005): nincs havi tagság, a bérlete kimerült (0 alk.).
      // Elutasított beléptetés után a kártyáról új alkalmas Hypoxi bérletet adunk el neki.
      await scanBarcode(page, '100005');
      await expect(toasts(page)).toContainText('Belépés elutasítva: Varga Judit');
      await sellToIdentifiedGuest(page, /^10 Alkalmas Hypoxi Bérlet/);
      const row = quickSearchRow(page, '100005');
      await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (10 alk.)');

      // Csak alkalmas bérlet van: nincs (ingyenes) köredzés belépés, a kezelésválasztó nyílik meg,
      // az egyetlen bérlet és kezelés előre kiválasztva.
      await scanBarcode(page, '100005');
      await expect(toasts(page)).toContainText('Kezelésválasztás: Varga Judit');
      await expect(toasts(page)).not.toContainText('Köredzés érkezés: Varga Judit');
      const dialog = page.getByRole('dialog', { name: 'Alkalmas Kezelés Kiválasztása & Bérlet Levonás' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^Hypoxi 30 perc/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(dialog.getByRole('button', { name: /^10 Alkalmas Hypoxi Bérlet/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (10 alk.)');

      await dialog.getByRole('button', { name: '1 Alkalom Levonása & Üdvözlés' }).click();
      await expect(toasts(page)).toContainText('Kezelés levonva: Varga Judit');
      await expect(row).toContainText('10 Alkalmas Hypoxi Bérlet (9 alk.)');
    },
  );
});
