import type { Page } from '@playwright/test';
import { SOCKET_EVENTS } from '@reform/shared';
import {
  deductTreatment,
  expect,
  expectMonitorIdle,
  loginToReception,
  quickSearchRowAction,
  scanBarcode,
  test,
  toasts,
} from './fixtures';
import { installSocketIoStub } from './socketio-stub';

/** Belépés a recepcióra, és a „Vendégmonitor” menüponttal a monitor megnyitása külön ablakban. */
async function openReceptionWithMonitor(page: Page) {
  await loginToReception(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Vendégmonitor' }).click();
  const monitor = await popupPromise;
  await expect(monitor).toHaveURL(/\/monitor$/);
  await expectMonitorIdle(monitor);
  await page.bringToFront();
  return monitor;
}

test.describe('Vendégmonitor azonos böngészőben', () => {
  test('a „Vendégmonitor” menüpont külön ablakban nyitja a jogosult monitort', async ({ page }) => {
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
  // monitorablakba, és a monitor jogosult, a kijelző mégsem vált. Valószínű gyökérok: a monitor
  // BroadcastChannelje minden rendernél bezárt és újranyílt (TICKET-29), az üzenet a résbe esett.
  test(
    'TICKET-2: azonos gépen nyitott monitor mock-módban üdvözli a köredzésre belépő vendéget (<1 mp)',
    async ({ page }) => {
      const monitor = await openReceptionWithMonitor(page);
      await scanBarcode(page, '100001');

      await expect(monitor.getByText('Jó edzést kívánunk!', { exact: true })).toBeVisible({ timeout: 1_000 });
      await expect(monitor.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
    },
  );

  test(
    'TICKET-2: azonos gépen nyitott monitor kezeléslevonás után a hátralévő alkalmakat mutatja',
    async ({ page }) => {
      const monitor = await openReceptionWithMonitor(page);
      await deductTreatment(page, '100001');

      await expect(monitor.getByText('Hátralévő alkalmak', { exact: true })).toBeVisible({ timeout: 1_000 });
      await expect(monitor.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
    },
  );
});

test.describe('Regresszió: TICKET-43', () => {
  test(
    'TICKET-43: köredzésre belépő vendéget a csak nőknek szóló köredzéshez illően köszönti',
    async ({ page }) => {
      const monitor = await openReceptionWithMonitor(page);
      // Kovács Anna (#100001): havi tagság a „Női Köredzés (Havi Tagság)” szolgáltatásra.
      await scanBarcode(page, '100001');

      await expect(monitor.getByText('Női Köredzés • Érkezés', { exact: true })).toBeVisible({ timeout: 1_000 });
      await expect(monitor.getByText('Jó edzést kívánunk!', { exact: true })).toBeVisible();
      await expect(monitor.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
    },
  );

  test(
    'TICKET-43: prémium kozmetikai bérletnél a monitor nem ír „Jó edzést”-et',
    async ({ page }) => {
      const monitor = await openReceptionWithMonitor(page);
      // Kovács Anna (#100001): 5 alkalmas prémium kozmetikai bérlet (Hialuronos arckezelés).
      await quickSearchRowAction(page, '100001', 'Kezelés -1');
      const dialog = page.getByRole('dialog', { name: 'Alkalmas Kezelés Kiválasztása & Bérlet Levonás' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: /^Hialuronos Arckezelés/ }).click();
      await expect(dialog.getByRole('button', { name: /^5 Alkalmas Prémium Kozmetikai Bérlet/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // A monitor-előnézet is a közös szövegtérképet használja.
      await expect(dialog).toContainText('Kellemes kikapcsolódást kívánunk!');
      await dialog.getByRole('button', { name: '1 Alkalom Levonása & Üdvözlés' }).click();

      await expect(monitor.getByText('Kozmetika • Üdvözlés', { exact: true })).toBeVisible({ timeout: 1_000 });
      await expect(monitor.getByText('Kellemes kikapcsolódást kívánunk!', { exact: true })).toBeVisible();
      await expect(monitor.getByRole('heading', { name: 'Kovács Anna!' })).toBeVisible();
      await expect(monitor.getByText('Jó edzést kívánunk!', { exact: true })).toHaveCount(0);
      await expect(monitor.getByText(/Női Köredzés/)).toHaveCount(0);
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

test.describe('Monitor kapcsolat: TICKET-29', () => {
  test('TICKET-29: a recepció és a monitor socketje nem nyílik újra rendernként', async ({ page, context }) => {
    const server = await installSocketIoStub(context);
    await loginToReception(page);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('navigation', { name: 'Főmenü' }).getByRole('link', { name: 'Vendégmonitor' }).click();
    const monitor = await popupPromise;
    await expect(monitor).toHaveURL(/\/monitor$/);
    // A monitor a stub szerverhez kapcsolódott.
    await expect(monitor.getByText('Élő Socket + Helyi Szinkron Aktív')).toBeVisible();

    await expect.poll(() => server.countByKind(false)).toBe(2);

    // A szerver minden csatlakozáskor broadcastol; a javítás előtt ez is újracsatlakozást gerjesztett.
    server.emit(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 2 }, false);
    await expect(page.getByRole('button', { name: 'Online (2 kijelző)' })).toBeVisible();

    // Néhány másodpercig nem nyílhat új kapcsolat (a hibás hurok ennyi idő alatt sokat nyitott).
    await page.waitForTimeout(3_000);
    // Monitor: egyetlen kijelző-kapcsolat. Recepció: a globális szkenner-csatorna és a
    // kijelzőszámot mutató recepciós pult egy-egy munkatársi kapcsolata.
    expect(server.countByKind(true)).toBe(1);
    expect(server.countByKind(false)).toBe(2);
    expect(server.openedCount()).toBe(3);
    expect(server.closedCount()).toBe(0);
  });
});

const PAIRED_DEVICE = {
  deviceId: 'device-e2e',
  deviceToken: 'device-token-e2e',
  deviceName: 'Bejárati TV',
};

const PAIRING_HEADING = 'Írd be a 6 jegyű párosító kódot';
const LIVE_CHIP = 'Élő Socket + Helyi Szinkron Aktív';

/**
 * Párosított önálló kijelző: eszköztoken a perzisztált auth store-ban (`reform-studio-auth`),
 * munkatársi munkamenet nélkül. Csak az első betöltéskor írjuk, hogy a monitor saját
 * párosítás-törlését egy újratöltés se írja felül.
 */
async function openPairedMonitor(page: Page) {
  await page.addInitScript((device) => {
    if (sessionStorage.getItem('e2e-auth-seeded')) return;
    sessionStorage.setItem('e2e-auth-seeded', '1');
    localStorage.setItem(
      'reform-studio-auth',
      JSON.stringify({ state: { accessToken: null, user: null, ...device }, version: 0 }),
    );
  }, PAIRED_DEVICE);
  await page.goto('/monitor');
  await expect(page.getByText(`Párosított Önálló Kijelző (${PAIRED_DEVICE.deviceName})`)).toBeVisible();
}

test.describe('Vendégmonitor párosítás: TICKET-32', () => {
  test('TICKET-32: a párosított kijelző a szerver állapotüzenete után élőnek látszik', async ({ page, context }) => {
    const server = await installSocketIoStub(context);
    await openPairedMonitor(page);

    await expect(page.getByText(LIVE_CHIP)).toBeVisible();
    expect(server.countByKind(true)).toBe(1);
  });

  test('TICKET-32: MONITOR_STATE nélkül nem írja, hogy él', async ({ page, context }) => {
    const server = await installSocketIoStub(context, { announceState: false });
    await openPairedMonitor(page);

    // A socket kapcsolódott, de a szerver még nem léptette be a szobába.
    await expect.poll(() => server.countByKind(true)).toBe(1);
    await expect(page.getByText('Kapcsolódás a szerverhez…')).toBeVisible();
    await expect(page.getByText(LIVE_CHIP)).toHaveCount(0);

    server.emit(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 1 }, true);
    await expect(page.getByText(LIVE_CHIP)).toBeVisible();
  });

  test('TICKET-32: a recepción bontott párosítás után a kijelző a párosító kódot kéri', async ({ page, context }) => {
    const server = await installSocketIoStub(context);
    await openPairedMonitor(page);
    await expect(page.getByText(LIVE_CHIP)).toBeVisible();

    // A gateway `disconnectDevice`-a: közvetlen visszavonás-üzenet, majd szerveroldali bontás.
    server.emit(
      SOCKET_EVENTS.MONITOR_DEVICE_REVOKED,
      {
        deviceId: PAIRED_DEVICE.deviceId,
        reason: 'A kijelző párosítása törlésre került a recepcióról.',
        timestamp: new Date().toISOString(),
      },
      true,
    );
    server.disconnect(true);

    await expect(page.getByRole('heading', { name: PAIRING_HEADING })).toBeVisible();
    await expect(toasts(page)).toContainText('Kijelző párosítása megszakadt');
    await expect(page.getByText(LIVE_CHIP)).toHaveCount(0);
  });

  test('TICKET-32: elutasított eszköztokennél a kijelző a párosító kódot kéri', async ({ page, context }) => {
    await installSocketIoStub(context, { rejectWith: 'AUTH.DEVICE_TOKEN_INVALID' });
    await page.addInitScript((device) => {
      if (sessionStorage.getItem('e2e-auth-seeded')) return;
      sessionStorage.setItem('e2e-auth-seeded', '1');
      localStorage.setItem(
        'reform-studio-auth',
        JSON.stringify({ state: { accessToken: null, user: null, ...device }, version: 0 }),
      );
    }, PAIRED_DEVICE);
    // Az elutasítás azonnal jön, a párosított nézet ezért csak egy pillanatig látszhat.
    await page.goto('/monitor');

    await expect(page.getByRole('heading', { name: PAIRING_HEADING })).toBeVisible();
    await expect(toasts(page)).toContainText('Kijelző párosítása megszakadt');
    // A párosítás a tárolóból is törlődött.
    const stored = await page.evaluate(() => localStorage.getItem('reform-studio-auth') ?? '');
    expect(stored).not.toContain(PAIRED_DEVICE.deviceToken);
  });
});
