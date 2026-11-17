import type { Page } from '@playwright/test';
import { expect, loginToReception, quickSearchRowAction, test } from './fixtures';

/** Egy lépés „Tovább” gombja (a vendégmódban egy fő művelet van). */
async function next(page: Page, name: string | RegExp = 'Tovább') {
  await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
}

/** Egy kérdés (rádiócsoport) válasza a kérdés szövege alapján. */
async function choose(page: Page, question: RegExp, option: string) {
  await page.getByRole('radiogroup', { name: question }).getByRole('radio', { name: option, exact: true }).click();
}

/** A lépés összes igen/nem kérdésére „Nem”. */
async function answerAllNo(page: Page) {
  const groups = page.getByRole('radiogroup');
  const count = await groups.count();
  for (let i = 0; i < count; i += 1) {
    await groups.nth(i).getByRole('radio', { name: 'Nem', exact: true }).click();
  }
}

async function drawSignature(page: Page) {
  const pad = page.getByTestId('signature-pad');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + box.height - 40, { steps: 8 });
  await page.mouse.up();
}

test.describe('Tabletes vendégfelvétel (TICKET-56)', () => {
  test('indítás PC-ről, kitöltés és aláírás tablet-nézetben, jóváhagyás, PDF a profilon', async ({ page }) => {
    await loginToReception(page);
    await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Vendégfelvétel' }).click();
    await expect(page.getByRole('heading', { name: 'Vendégfelvétel', level: 1 })).toBeVisible();

    // Előkészítés: meglévő vendég (Kovács Anna), Köredzés csomag.
    await page.getByRole('button', { name: 'Új vendégfelvétel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Új vendégfelvétel' });
    await dialog.getByRole('radio', { name: 'Meglévő vendég' }).click();
    await dialog.getByRole('searchbox', { name: 'Vendég keresése' }).fill('Kovács');
    await dialog.getByRole('radio', { name: /Kovács Anna/ }).click();
    await dialog.getByRole('checkbox', { name: /^Köredzés/ }).click();
    await dialog.getByRole('button', { name: 'Előkészítés' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Előkészítve').first()).toBeVisible();

    // Átadás ezen az eszközön: a kilépési kódot a munkatárs látja.
    await page.getByRole('button', { name: 'Vendégmód ezen az eszközön' }).click();
    const exitCode = (await page.getByTestId('intake-exit-code').textContent())!.trim();
    expect(exitCode).toMatch(/^\d{6}$/);
    await page.getByRole('button', { name: 'Átadás a vendégnek' }).click();
    await expect(page).toHaveURL(/\/tablet\/intake$/);

    // A vendégmódban a munkatársi oldalak nem érhetők el.
    await page.goto('/reception');
    await expect(page).toHaveURL(/\/tablet\/intake$/);

    // 1. Adatkezelési tájékoztató
    await expect(page.getByRole('heading', { name: 'Adatkezelési tájékoztató' })).toBeVisible();
    await page.getByRole('checkbox', { name: /tájékoztatót megismertem/ }).click();
    await next(page);
    // 2. Személyes adatok: a meglévő profilból előtöltve.
    await expect(page.getByLabel(/Vezetéknév/)).toHaveValue('Kovács');
    await next(page);
    // 3. Profilkép: kihagyható.
    await expect(page.getByRole('heading', { name: 'Profilkép' })).toBeVisible();
    await next(page, 'Kihagyás');
    // 4. Egészségügyi hozzájárulás
    await page.getByRole('checkbox', { name: /egészségügyi adataim/ }).click();
    await next(page);
    // 5. Egészségügyi kérdőív: a kockázatos válasznál figyelmeztetés a kérdés alatt; kötelező mezők.
    await expect(page.getByRole('heading', { name: 'Egészségügyi kérdőív' })).toBeVisible();
    await next(page);
    await expect(page.getByText('A kérdés megválaszolása kötelező.').first()).toBeVisible();
    await choose(page, /műtéted az elmúlt 6 hétben/, 'Igen');
    await expect(page.getByRole('alert').filter({ hasText: 'Friss műtét után' })).toBeVisible();
    await choose(page, /laborvizsgálatod/, 'Igen');
    await expect(page.getByRole('radiogroup', { name: /Összkoleszterin/ })).toBeVisible();
    await choose(page, /laborvizsgálatod/, 'Nem');
    await expect(page.getByRole('radiogroup', { name: /Összkoleszterin/ })).toBeHidden();
    await page.getByRole('checkbox', { name: 'Fogyás' }).click();
    await choose(page, /folyadékot/, '1–2 liter');
    await choose(page, /munkád/, 'Ülőmunka');
    await next(page);
    // 6. Köredzés ellenjavallatai
    await answerAllNo(page);
    await next(page);
    // 7. Tagsági szerződés
    await choose(page, /tagság időtartama/, '3 hónap');
    await page.getByRole('checkbox', { name: /tagsági szerződést/ }).click();
    await next(page);
    // 8. Önkéntes hozzájárulások: nincs előre kiválasztva.
    await expect(page.getByRole('radio', { name: 'Igen', exact: true }).first()).not.toBeChecked();
    await answerAllNo(page);
    await next(page);
    // 9. Aláírás
    await expect(page.getByRole('heading', { name: 'Aláírás' })).toBeVisible();
    const submit = page.getByRole('button', { name: 'Aláírás és beküldés' });
    await expect(submit).toBeDisabled();
    await drawSignature(page);
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Köszönjük, minden adatot megkaptunk' })).toBeVisible();

    // Kilépés csak a munkatárs kódjával.
    await page.getByRole('button', { name: 'Kilépés (munkatárs)' }).click();
    const exitDialog = page.getByRole('dialog', { name: 'Kilépés a vendégmódból' });
    await exitDialog.getByLabel('Kilépési kód').fill(exitCode === '000000' ? '111111' : '000000');
    await exitDialog.getByRole('button', { name: 'Kilépés', exact: true }).click();
    await expect(page).toHaveURL(/\/tablet\/intake$/);
    await exitDialog.getByLabel('Kilépési kód').fill(exitCode);
    await exitDialog.getByRole('button', { name: 'Kilépés', exact: true }).click();
    await expect(page).toHaveURL(/\/intake\?session=/);

    // Ellenőrzés: egészségügyi válaszok külön, naplózott megnyitással; jóváhagyás.
    await expect(page.getByText('Ellenőrzésre vár').first()).toBeVisible();
    await page.getByRole('button', { name: 'Megtekintés (naplózva)' }).click();
    await expect(page.getByText(/kockázatot jelző válasz/)).toBeVisible();
    await page.getByRole('button', { name: 'Jóváhagyás' }).click();
    await expect(page.getByText('Aláírva, lezárva').first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Aláírt felvételi dokumentumok' })).toContainText(
      'Egészségügyi kérdőív',
    );

    // A PDF-ek a vendégprofil Dokumentumok fülén.
    await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Recepció', exact: true }).click();
    await quickSearchRowAction(page, '100001', 'Adatlap');
    await page.getByRole('radio', { name: /^Dokumentumok/ }).click();
    const documents = page.getByRole('list', { name: 'Aláírt felvételi dokumentumok' });
    await expect(documents).toContainText('Adatkezelési tájékoztató');
    await expect(documents).toContainText('Köredzés – tagsági szerződés');
    await expect(documents.getByRole('button', { name: /PDF megnyitása/ }).first()).toBeEnabled();
  });
});
