import type { Page } from '@playwright/test';
import { deductTreatment, expect, expectMonitorIdle, loginToReception, scanBarcode, test } from './fixtures';

/** Belépés a recepcióra, és a „Vendégmonitor” gombbal a monitor megnyitása külön ablakban. */
async function openReceptionWithMonitor(page: Page) {
  await loginToReception(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Vendégmonitor' }).click();
  const monitor = await popupPromise;
  await expect(monitor).toHaveURL(/\/monitor$/);
  await expectMonitorIdle(monitor);
  await page.bringToFront();
  return monitor;
}

test.describe('Vendégmonitor azonos böngészőben', () => {
  test('a „Vendégmonitor” gomb külön ablakban nyitja a jogosult monitort', async ({ page }) => {
    await openReceptionWithMonitor(page);
  });

  test('a /demo beágyazott monitor-előnézete üdvözli a beléptetett vendéget', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: /^Kovács Anna \(Köredzés\)/ }).click();

    // A /demo oldalon egyetlen monitorkártya van, a szimulátorgombok szövege nem egyezik pontosan.
    await expect(page.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
    await expect(page.getByText('Jó edzést kívánunk!', { exact: true })).toBeVisible();
  });
});

test.describe('Regresszió: TICKET-2', () => {
  // Megfigyelés (TICKET-11): a CHECKIN_RESULT üzenet a BroadcastChannelen megérkezik a
  // monitorablakba, és a monitor jogosult („Helyi Broadcast Szinkron Aktív”), a kijelző mégsem vált.
  test.fixme(
    'TICKET-2: azonos gépen nyitott monitor mock-módban üdvözli a köredzésre belépő vendéget (<1 mp)',
    async ({ page }) => {
      const monitor = await openReceptionWithMonitor(page);
      await scanBarcode(page, '100001');

      await expect(monitor.getByText('Jó edzést kívánunk!', { exact: true })).toBeVisible({ timeout: 1_000 });
      await expect(monitor.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
    },
  );

  test.fixme(
    'TICKET-2: azonos gépen nyitott monitor kezeléslevonás után a hátralévő alkalmakat mutatja',
    async ({ page }) => {
      const monitor = await openReceptionWithMonitor(page);
      await deductTreatment(page, '100001');

      await expect(monitor.getByText('Hátralévő alkalmak', { exact: true })).toBeVisible({ timeout: 1_000 });
      await expect(monitor.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
    },
  );
});

test.describe('Vendégmonitor adatszűrés: TICKET-17', () => {
  test('TICKET-17: elutasításnál a /demo monitor név és ok nélkül a recepcióhoz küld', async ({ page }) => {
    await page.goto('/demo');
    // Horváth Dóra (#100006): szüneteltetett tagság, fagyasztott bérlet → elutasítás.
    await page.getByRole('button', { name: /^Horváth Dóra #100006/ }).click();

    await expect(page.getByText('Kérjük, fáradj a recepcióhoz!', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Horváth Dóra!' })).toHaveCount(0);
  });

  test('TICKET-17: a monitor BroadcastChannelre nem kerül tartozás, vonalkód, azonosító vagy ok', async ({ page }) => {
    const monitor = await openReceptionWithMonitor(page);
    await monitor.evaluate(() => {
      const w = window as unknown as { __monitorMessages: unknown[] };
      w.__monitorMessages = [];
      new BroadcastChannel('reform_monitor_channel').onmessage = (e) => w.__monitorMessages.push(e.data);
    });

    await scanBarcode(page, '100005'); // Varga Judit: kimerült bérlet → elutasítás
    await deductTreatment(page, '100001'); // Kovács Anna: kezelés-levonás

    const messagesJson = () =>
      monitor.evaluate(() => JSON.stringify((window as unknown as { __monitorMessages: unknown[] }).__monitorMessages));
    await expect.poll(messagesJson).toContain('"status":"DENIED"');
    await expect.poll(messagesJson).toContain('"mode":"TREATMENT_GREETING"');

    const json = await messagesJson();
    for (const needle of ['overdue', 'barcode', 'guestId', 'checkInId', 'usageId', 'reason', 'OVERDUE_DUES', '100005', 'Varga Judit']) {
      expect(json, `"${needle}" nem juthat el a monitorra`).not.toContain(needle);
    }
  });
});
