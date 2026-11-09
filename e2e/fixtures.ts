import { expect, test as base, type Page } from '@playwright/test';

/**
 * Közös fixture: minden teszt friss böngészőkontextusban fut, így a mock-motor
 * (localStorage: `reform-studio-mock-sandbox-v4`) mindig a kiinduló demóadatokkal indul.
 *
 * Biztonsági háló: ha valódi API-címmel buildelt szerver fut (pl. `reuseExistingServer`),
 * az `/api/...` kéréseket megszakítjuk, így a kliens akkor is a mock-motorra esik vissza.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    // A mock-adatok a „most”-hoz képest készülnek (pl. ma 2 órája rögzített befizetés).
    // Fix délidőből indított óra mellett éjfél körül sem csúsznak át az előző napra.
    await context.clock.install({ time: new Date('2026-03-10T12:00:00+01:00') });
    await context.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort('connectionrefused'),
    );
    await use(context);
  },
});

export { expect };

/** Mock-módú belépés: az API nem érhető el, ezért a login helyi munkamenettel léptet be. */
export async function loginToReception(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Belépés a Recepciós Pultra' }).click();
  await expect(page).toHaveURL(/\/reception$/);
  await expect(page.getByRole('heading', { name: 'RE-FORM Stúdió', level: 1 })).toBeVisible();
}

/** Vonalkód beírása a recepció beolvasó mezőjébe (ugyanaz az út, mint a kézi szkennelés). */
export async function scanBarcode(page: Page, barcode: string) {
  await page.getByPlaceholder(/Csippantsd le a QR-kódot/).fill(barcode);
  await page.getByRole('button', { name: 'Köredzés Beléptetés' }).click();
}

/** A recepció „Vendég Gyorskereső” listájának egy vendégsora (vonalkód alapján). */
export function quickSearchRow(page: Page, barcode: string) {
  return page
    .locator('div')
    .filter({ hasText: `#${barcode}` })
    .filter({ has: page.getByRole('button', { name: 'Kezelés -1', exact: true }) })
    .last();
}

/** Kezelés levonása a gyorskereső sorából (Hypoxi 30 perc, a vendég első megfelelő bérletéről). */
export async function deductTreatment(page: Page, barcode: string) {
  await quickSearchRow(page, barcode).getByRole('button', { name: 'Kezelés -1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alkalmas Kezelés Kiválasztása & Bérlet Levonás' })).toBeVisible();
  await page.getByRole('button', { name: /^Hypoxi 30 perc/ }).click();
  await page.getByRole('button', { name: '1 Alkalom Levonása & Üdvözlés' }).click();
}

export const SELL_MODAL_TITLE = 'Bérletértékesítés & Kassza Rögzítés';

/** Eladás az „Utoljára Azonosított Vendég” kártyáról (a vendég előre ki van választva). */
export async function sellToIdentifiedGuest(page: Page, templateName: RegExp, paymentMethod?: string) {
  await page.getByRole('button', { name: 'Új Bérlet Eladása' }).click();
  await expect(page.getByRole('heading', { name: SELL_MODAL_TITLE })).toBeVisible();
  await page.getByRole('button', { name: templateName }).click();
  if (paymentMethod) await page.getByRole('button', { name: paymentMethod, exact: true }).click();
  await page.getByRole('button', { name: 'Bérlet Eladása & Fizetés' }).click();
  await expect(page.getByRole('heading', { name: SELL_MODAL_TITLE })).toBeHidden();
}

/** A jogosult vendégmonitor alapállapota (helyi csatorna él, üdvözlő képernyő). */
export async function expectMonitorIdle(page: Page) {
  await expect(page.getByText('Helyi Broadcast Szinkron Aktív')).toBeVisible();
  await expect(page.getByText('Üdvözlünk! Kérjük, érintsd le a belépőkártyádat a recepción.')).toBeVisible();
}

/** A sonner toast-régió (a visszajelzések itt jelennek meg). */
export function toasts(page: Page) {
  return page.getByRole('region', { name: /Notifications/ });
}
