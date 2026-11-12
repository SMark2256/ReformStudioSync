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

/** Az E2E saját tesztmunkatársa (TICKET-35). */
export const E2E_STAFF_EMAIL = 'e2e@reformstudio.test';
/** Mock-módban (API nélkül) ezzel a kóddal lehet belépni; valódi API mellett az `AUTH_FIXED_LOGIN_CODE`. */
export const E2E_LOGIN_CODE = '123456';

/** Belépőkód kérése a `/login` oldalon; utána a kódlépés látszik. */
export async function requestLoginCode(page: Page, email = E2E_STAFF_EMAIL) {
  await page.goto('/login');
  await page.getByLabel('E-mail cím').fill(email);
  await page.getByRole('button', { name: 'Kód küldése' }).click();
  await expect(page.getByLabel('Belépőkód')).toBeVisible();
}

/** Mock-módú belépés: az API nem érhető el, ezért a kódellenőrzés helyi munkamenettel léptet be. */
export async function loginToReception(page: Page) {
  await requestLoginCode(page);
  await page.getByLabel('Belépőkód').fill(E2E_LOGIN_CODE);
  await page.getByRole('button', { name: 'Belépés', exact: true }).click();
  await expect(page).toHaveURL(/\/reception$/);
  await expect(
    page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Recepció', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
}

/** Vonalkód beírása a recepció beolvasó mezőjébe (ugyanaz az út, mint a kézi szkennelés). */
export async function scanBarcode(page: Page, barcode: string) {
  await page.getByPlaceholder(/Csippantsd le a QR-kódot/).fill(barcode);
  await page.getByRole('button', { name: 'Köredzés beléptetés' }).click();
}

/** A recepció „Vendégkereső” listájának egy vendégsora (vonalkód alapján). */
export function quickSearchRow(page: Page, barcode: string) {
  return page
    .getByRole('list', { name: 'Vendégkereső találatai' })
    .getByRole('listitem')
    .filter({ hasText: `#${barcode}` });
}

/** A gyorskereső sorának „⋯” menüjéből választ műveletet (Kezelés -1, Adatlap, Digitális kártya (QR)). */
export async function quickSearchRowAction(page: Page, barcode: string, action: string) {
  await quickSearchRow(page, barcode).getByRole('button', { name: /^További műveletek: / }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

/** Kezelés levonása a gyorskereső sorából (Hypoxi 30 perc, a vendég első megfelelő bérletéről). */
export async function deductTreatment(page: Page, barcode: string) {
  await quickSearchRowAction(page, barcode, 'Kezelés -1');
  await expect(page.getByRole('heading', { name: 'Alkalmas Kezelés Kiválasztása & Bérlet Levonás' })).toBeVisible();
  await page.getByRole('button', { name: /^Hypoxi 30 perc/ }).click();
  await page.getByRole('button', { name: '1 Alkalom Levonása & Üdvözlés' }).click();
}

export const SELL_MODAL_TITLE = 'Bérletértékesítés & Kassza Rögzítés';

/** Eladás az „Utoljára azonosított vendég” kártyáról (a vendég előre ki van választva). */
export async function sellToIdentifiedGuest(page: Page, templateName: RegExp, paymentMethod?: string) {
  await page.getByRole('button', { name: 'Új bérlet eladása' }).click();
  await expect(page.getByRole('heading', { name: SELL_MODAL_TITLE })).toBeVisible();
  await page.getByRole('button', { name: templateName }).click();
  if (paymentMethod) await page.getByRole('button', { name: paymentMethod, exact: true }).click();
  await page.getByRole('button', { name: 'Bérlet Eladása & Fizetés' }).click();
  await expect(page.getByRole('heading', { name: SELL_MODAL_TITLE })).toBeHidden();
}

/** A jogosult vendégmonitor alapállapota (szerver nélkül csak a helyi csatorna él, üdvözlő képernyő). */
export async function expectMonitorIdle(page: Page) {
  await expect(page.getByText('Csak helyi szinkron')).toBeVisible();
  await expect(page.getByText('Üdvözlünk! Kérjük, érintsd le a belépőkártyádat a recepción.')).toBeVisible();
}

/** A sonner toast-régió (a visszajelzések itt jelennek meg). */
export function toasts(page: Page) {
  return page.getByRole('region', { name: /Notifications/ });
}
