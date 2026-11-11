import {
  APP_ERROR_CATALOG,
  appError,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  MonitorDeviceRevokedPayload,
  MonitorStatePayload,
  SOCKET_EVENTS,
  toMonitorPayload,
} from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonitorGateway } from './monitor.gateway';

const STUDIO_ID = 'studio-1';
const MONITOR_ROOM = `studio:${STUDIO_ID}`;
const STAFF_ROOM = `studio:${STUDIO_ID}:staff`;

const BARCODE = '100001';
const GUEST_ID = 'guest-secret-id';
const CHECK_IN_ID = 'checkin-secret-id';
const REASON = 'Lejárt havi tagdíj: 24 000 Ft, 32 napja esedékes';

/** A monitor szobába küldött payloadban egyik sem fordulhat elő (kulcsként vagy értékként). */
const FORBIDDEN = [
  'overdueAmountHuf',
  'overdueDays',
  'barcode',
  'guestId',
  'checkInId',
  'usageId',
  'reason',
  'OVERDUE_DUES',
  'expirationDate',
  'suggestedRenewalTemplateId',
  BARCODE,
  GUEST_ID,
  CHECK_IN_ID,
  REASON,
  '24000',
];

function fullResult(
  overrides: Partial<CheckInResultPayload> = {},
): CheckInResultPayload {
  return {
    checkInId: CHECK_IN_ID,
    usageId: 'usage-secret-id',
    mode: 'TREATMENT_GREETING',
    status: CheckInStatus.SUCCESS,
    guestId: GUEST_ID,
    barcode: BARCODE,
    guestName: 'Kovács Anna',
    serviceName: 'Hypoxi',
    passName: '10 alkalmas Hypoxi',
    remainingPasses: 1,
    totalPasses: 10,
    expirationDate: '2026-12-01',
    reason: REASON,
    warnings: ['LOW_OCCASIONS', 'OVERDUE_DUES', 'EXPIRING_SOON'],
    overdueAmountHuf: 24000,
    overdueDays: 32,
    greetingSeconds: 7,
    suggestedRenewalTemplateId: 'tpl-1',
    timestamp: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

function expectNoSensitiveData(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const needle of FORBIDDEN) {
    expect(json, `"${needle}" nem juthat el a monitorra`).not.toContain(needle);
  }
}

describe('MonitorGateway — Vendégmonitor adatszűrés (TICKET-17)', () => {
  let gateway: MonitorGateway;
  let emitted: {
    room: string;
    except?: string;
    event: string;
    payload: unknown;
  }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authServiceMock: any;

  beforeEach(() => {
    emitted = [];
    authServiceMock = {
      validateSocketToken: vi.fn(),
      recordDeviceActivity: vi.fn().mockResolvedValue(undefined),
    };
    gateway = new MonitorGateway(authServiceMock);
    // Socket.io `to(room)[.except(room)].emit(...)` minimális utánzata.
    const target = (room: string, except?: string) => ({
      except: (excluded: string) => target(room, excluded),
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, except, event, payload });
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gateway as any).server = { to: (room: string) => target(room) };
  });

  const monitorRoomEvents = () => emitted.filter((e) => e.room === MONITOR_ROOM);

  it.each([
    ['elutasítás tartozás miatt', { status: CheckInStatus.DENIED, mode: 'CIRCUIT_GREETING' as const }],
    ['sikeres kezelés-üdvözlés', {}],
    ['ismételt szkennelés', { status: CheckInStatus.DUPLICATE_SCAN }],
  ])(
    'beléptetésnél (%s) a monitor szobába nem kerül tartozás, vonalkód, azonosító vagy ok',
    (_label, overrides) => {
      gateway.emitCheckInResult(fullResult(overrides), STUDIO_ID);

      const toMonitor = monitorRoomEvents();
      expect(toMonitor).toHaveLength(1);
      expect(toMonitor[0].event).toBe(SOCKET_EVENTS.MONITOR_CHECKIN_RESULT);
      // A munkatársi kliensek nem kapják meg kétszer (teljes + szűkített).
      expect(toMonitor[0].except).toBe(STAFF_ROOM);
      expectNoSensitiveData(toMonitor[0].payload);
    },
  );

  it('a teljes eredményt csak a munkatársi szoba kapja', () => {
    const payload = fullResult({ status: CheckInStatus.DENIED });
    gateway.emitCheckInResult(payload, STUDIO_ID);

    const full = emitted.filter((e) => e.event === SOCKET_EVENTS.CHECKIN_RESULT);
    expect(full).toEqual([
      { room: STAFF_ROOM, event: SOCKET_EVENTS.CHECKIN_RESULT, payload },
    ]);
  });

  it('elutasításnál a monitor név és ok nélküli, semleges payloadot kap', () => {
    gateway.emitCheckInResult(
      fullResult({ status: CheckInStatus.DENIED }),
      STUDIO_ID,
    );

    expect(monitorRoomEvents()[0].payload).toEqual({
      status: 'DENIED',
      mode: 'TREATMENT_GREETING',
      warnings: [],
      greetingSeconds: 7,
      timestamp: '2026-11-08T10:00:00.000Z',
    });
  });

  it('sztornónál a monitor szobába nem kerül név, azonosító vagy egyenleg', () => {
    const revoked: CheckInRevokedPayload = {
      checkInId: CHECK_IN_ID,
      guestId: GUEST_ID,
      guestName: 'Kovács Anna',
      serviceName: 'Hypoxi',
      restoredRemainingPasses: 2,
      timestamp: '2026-11-08T10:01:00.000Z',
    };
    gateway.emitCheckInRevoked(revoked, STUDIO_ID);

    const toMonitor = monitorRoomEvents();
    expect(toMonitor).toEqual([
      {
        room: MONITOR_ROOM,
        except: STAFF_ROOM,
        event: SOCKET_EVENTS.MONITOR_CHECKIN_REVOKED,
        payload: { timestamp: revoked.timestamp },
      },
    ]);
    expect(
      emitted.filter((e) => e.event === SOCKET_EVENTS.CHECKIN_REVOKED),
    ).toEqual([
      { room: STAFF_ROOM, event: SOCKET_EVENTS.CHECKIN_REVOKED, payload: revoked },
    ]);
  });

  it('a monitor állapot-payload nem tartalmaz vendégadatot', () => {
    expect(Object.keys(gateway.getMonitorState(STUDIO_ID)).sort()).toEqual([
      'connectedDisplays',
      'lastHeartbeat',
      'studioId',
    ]);
  });

  it.each([
    ['DEVICE', false, [MONITOR_ROOM]],
    ['DEVICE', true, [MONITOR_ROOM]],
    ['STAFF', false, [MONITOR_ROOM, STAFF_ROOM]],
    // Munkatársi tokennel megnyitott Vendégmonitor: nem kap teljes eredményt.
    ['STAFF', true, [MONITOR_ROOM]],
  ] as const)(
    '%s tokennel (displayOnly: %s) csatlakozó kliens szobái: %j',
    async (type, displayOnly, expectedRooms) => {
      authServiceMock.validateSocketToken.mockResolvedValue({
        studioId: STUDIO_ID,
        type,
        name: 'Kijelző',
        deviceId: type === 'DEVICE' ? 'device-1' : undefined,
      });
      const joined: string[] = [];
      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'token', displayOnly }, headers: {} },
        join: vi.fn(async (room: string) => {
          joined.push(room);
        }),
        disconnect: vi.fn(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await gateway.handleConnection(client as any);

      expect(joined).toEqual(expectedRooms);
      expect(client.disconnect).not.toHaveBeenCalled();
    },
  );
});

type ValidatedSocket = {
  studioId: string;
  type: 'STAFF' | 'DEVICE';
  name: string;
  deviceId?: string;
};

const DEVICE_AUTH: ValidatedSocket = {
  studioId: STUDIO_ID,
  type: 'DEVICE',
  name: 'Kijelző',
  deviceId: 'device-1',
};
const STAFF_AUTH: ValidatedSocket = {
  studioId: STUDIO_ID,
  type: 'STAFF',
  name: 'Recepció',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Socket minimális utánzata: a bontás a valódihoz hasonlóan kiüríti a szobákat. */
function mockClient(id: string, displayOnly = false) {
  const rooms = new Set<string>();
  return {
    id,
    disconnected: false,
    rooms,
    handshake: { auth: { token: 'token', displayOnly }, headers: {} },
    join: vi.fn(async (room: string) => {
      rooms.add(room);
    }),
    leave: vi.fn(async (room: string) => {
      rooms.delete(room);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe('MonitorGateway — kapcsolatnyilvántartás és kijelzőszám (TICKET-30)', () => {
  let gateway: MonitorGateway;
  let states: { room: string; payload: MonitorStatePayload }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authServiceMock: any;

  beforeEach(() => {
    states = [];
    authServiceMock = {
      validateSocketToken: vi.fn(),
      recordDeviceActivity: vi.fn().mockResolvedValue(undefined),
    };
    gateway = new MonitorGateway(authServiceMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gateway as any).server = {
      to: (room: string) => ({
        emit: (event: string, payload: MonitorStatePayload) => {
          if (event === SOCKET_EVENTS.MONITOR_STATE) states.push({ room, payload });
        },
      }),
    };
  });

  type Client = ReturnType<typeof mockClient>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connect = (client: Client) => gateway.handleConnection(client as any);
  const disconnect = (client: Client) => {
    client.disconnected = true;
    client.rooms.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gateway.handleDisconnect(client as any);
  };
  const displays = () => gateway.getMonitorState(STUDIO_ID).connectedDisplays;

  it('a hitelesítés alatt bontó kliens nem marad nyilvántartva és szobában', async () => {
    const auth = deferred<ValidatedSocket>();
    authServiceMock.validateSocketToken.mockReturnValue(auth.promise);
    const client = mockClient('socket-1');

    const connecting = connect(client);
    disconnect(client);
    auth.resolve(DEVICE_AUTH);
    await connecting;

    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(gateway.getOnlineDeviceIds().size).toBe(0);
    expect(displays()).toBe(0);
    expect(client.rooms.size).toBe(0);
    expect(client.join).not.toHaveBeenCalled();
    expect(states).toEqual([]);
  });

  it('a szobába lépés közben bontó kliens szobatagsága megszűnik, nincs bejegyzés', async () => {
    authServiceMock.validateSocketToken.mockResolvedValue(DEVICE_AUTH);
    const client = mockClient('socket-1');
    client.join.mockImplementation(async (room: string) => {
      client.rooms.add(room);
      disconnect(client);
      // A valódi socket.io a bontás után is felveszi a szobába.
      client.rooms.add(room);
    });

    await connect(client);

    expect(client.rooms.size).toBe(0);
    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(displays()).toBe(0);
    expect(states).toEqual([]);
  });

  it.each([
    ['DEVICE', false, DEVICE_AUTH, 1],
    ['STAFF', true, STAFF_AUTH, 1],
    // Recepciós fül: nem kijelző.
    ['STAFF', false, STAFF_AUTH, 0],
  ] as const)(
    '%s tokennel (displayOnly: %s) csatlakozó kliens után a kijelzőszám %i',
    async (_type, displayOnly, validated, expected) => {
      authServiceMock.validateSocketToken.mockResolvedValue(validated);

      await connect(mockClient('socket-1', displayOnly));

      expect(displays()).toBe(expected);
      expect(states[states.length - 1]).toMatchObject({
        room: MONITOR_ROOM,
        payload: { connectedDisplays: expected },
      });
    },
  );

  it('egy kijelző és két recepciós fül mellett a kijelzőszám 1', async () => {
    authServiceMock.validateSocketToken
      .mockResolvedValueOnce(DEVICE_AUTH)
      .mockResolvedValue(STAFF_AUTH);

    await connect(mockClient('device-socket'));
    await connect(mockClient('desk-1'));
    await connect(mockClient('desk-2'));

    expect(displays()).toBe(1);
    expect(gateway.getOnlineDeviceIds()).toEqual(new Set(['device-1']));
  });

  it('bontás után a kijelzőszám visszamegy, az ismételt bontás nem hat', async () => {
    authServiceMock.validateSocketToken.mockResolvedValue(DEVICE_AUTH);
    const client = mockClient('socket-1');

    await connect(client);
    expect(displays()).toBe(1);
    expect(gateway.isDeviceOnline('device-1')).toBe(true);

    disconnect(client);
    expect(displays()).toBe(0);
    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(states.map((s) => s.payload.connectedDisplays)).toEqual([1, 0]);

    disconnect(client);
    expect(states).toHaveLength(2);
  });

  it('elutasított token esetén bont, és nem regisztrál', async () => {
    authServiceMock.validateSocketToken.mockRejectedValue(new Error('invalid'));
    const client = mockClient('socket-1');

    await connect(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
    expect(displays()).toBe(0);
  });
});

const OTHER_DEVICE_AUTH: ValidatedSocket = { ...DEVICE_AUTH, deviceId: 'device-2' };

const REVOKED: MonitorDeviceRevokedPayload = {
  deviceId: 'device-1',
  reason: 'A kijelző párosítása törlésre került a recepcióról.',
  timestamp: '2026-11-11T10:00:00.000Z',
};

describe('MonitorGateway — visszavonás és elutasítás (TICKET-31)', () => {
  type Client = ReturnType<typeof mockClient>;

  let gateway: MonitorGateway;
  let states: MonitorStatePayload[];
  let sockets: Map<string, Client>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authServiceMock: any;

  beforeEach(() => {
    states = [];
    sockets = new Map();
    authServiceMock = {
      validateSocketToken: vi.fn(),
      recordDeviceActivity: vi.fn().mockResolvedValue(undefined),
    };
    gateway = new MonitorGateway(authServiceMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gateway as any).server = {
      sockets,
      to: () => ({
        emit: (event: string, payload: MonitorStatePayload) => {
          if (event === SOCKET_EVENTS.MONITOR_STATE) states.push(payload);
        },
      }),
    };
  });

  /** A valódihoz hasonlóan a szerveroldali bontás is lefuttatja a `handleDisconnect`-et. */
  function serverClient(id: string) {
    const client = mockClient(id);
    client.disconnect.mockImplementation(() => {
      client.disconnected = true;
      client.rooms.clear();
      sockets.delete(id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gateway.handleDisconnect(client as any);
    });
    sockets.set(id, client);
    return client;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connect = (client: Client) => gateway.handleConnection(client as any);
  const displays = () => gateway.getMonitorState(STUDIO_ID).connectedDisplays;
  const expectEmittedBeforeDisconnect = (client: Client) => {
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit.mock.invocationCallOrder[0]).toBeLessThan(
      client.disconnect.mock.invocationCallOrder[0],
    );
  };

  it('visszavonáskor az eszköz minden socketje megkapja az okot és bontódik, más kliens érintetlen', async () => {
    authServiceMock.validateSocketToken
      .mockResolvedValueOnce(DEVICE_AUTH)
      .mockResolvedValueOnce(DEVICE_AUTH)
      .mockResolvedValueOnce(OTHER_DEVICE_AUTH)
      .mockResolvedValue(STAFF_AUTH);
    const first = serverClient('device-1-a');
    const second = serverClient('device-1-b');
    const other = serverClient('device-2');
    const desk = serverClient('desk');
    for (const client of [first, second, other, desk]) await connect(client);
    expect(displays()).toBe(3);
    states = [];

    gateway.disconnectDevice(REVOKED);

    for (const client of [first, second]) {
      expect(client.emit.mock.calls).toEqual([
        [SOCKET_EVENTS.MONITOR_DEVICE_REVOKED, REVOKED],
      ]);
      expectEmittedBeforeDisconnect(client);
    }
    for (const client of [other, desk]) {
      expect(client.emit).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    }
    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(gateway.getOnlineDeviceIds()).toEqual(new Set(['device-2']));
    expect(displays()).toBe(1);
    // Egyetlen állapotüzenet a stúdiónak, a bontáskori takarítás nem küld újat.
    expect(states.map((s) => s.connectedDisplays)).toEqual([1]);
  });

  it('kapcsolódó socket nélküli eszköz visszavonása nem küld állapotot', () => {
    gateway.disconnectDevice(REVOKED);

    expect(states).toEqual([]);
  });

  it.each([
    ['érvénytelen kijelző token', appError('AUTH.DEVICE_TOKEN_INVALID'), 'AUTH.DEVICE_TOKEN_INVALID'],
    // Idegen hiba szövege nem juthat a kliensre, csak a katalógusé.
    ['váratlan hiba', new Error('belső részlet'), 'COMMON.INTERNAL'],
  ] as const)(
    'elutasításnál (%s) a kliens a bontás előtt megkapja az okot',
    async (_label, error, code) => {
      authServiceMock.validateSocketToken.mockRejectedValue(error);
      const client = serverClient('socket-1');

      await connect(client);

      expect(client.emit.mock.calls).toEqual([
        [
          SOCKET_EVENTS.MONITOR_AUTH_REJECTED,
          {
            code,
            message: APP_ERROR_CATALOG[code].message,
            timestamp: expect.any(String),
          },
        ],
      ]);
      expectEmittedBeforeDisconnect(client);
      expect(client.join).not.toHaveBeenCalled();
      expect(displays()).toBe(0);
      expect(states).toEqual([]);
    },
  );

  it('hiányzó tokennél a kód AUTH.UNAUTHENTICATED, hitelesítés nincs', async () => {
    const client = serverClient('socket-1');
    client.handshake.auth.token = '';

    await connect(client);

    expect(authServiceMock.validateSocketToken).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.MONITOR_AUTH_REJECTED,
      expect.objectContaining({
        code: 'AUTH.UNAUTHENTICATED',
        message: APP_ERROR_CATALOG['AUTH.UNAUTHENTICATED'].message,
      }),
    );
    expectEmittedBeforeDisconnect(client);
  });

  it('a hitelesítés alatt visszavont eszköz nem regisztrál, az újrapárosított igen', async () => {
    const auth = deferred<ValidatedSocket>();
    authServiceMock.validateSocketToken.mockReturnValueOnce(auth.promise);
    const stale = serverClient('stale');

    // A régi tokennel a visszavonás előtt hitelesült, de csak utána regisztrálna.
    const connecting = connect(stale);
    gateway.disconnectDevice(REVOKED);
    auth.resolve(DEVICE_AUTH);
    await connecting;

    expect(stale.emit.mock.calls).toEqual([
      [
        SOCKET_EVENTS.MONITOR_AUTH_REJECTED,
        expect.objectContaining({ code: 'AUTH.DEVICE_TOKEN_INVALID' }),
      ],
    ]);
    expectEmittedBeforeDisconnect(stale);
    expect(stale.rooms.size).toBe(0);
    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(states).toEqual([]);

    // Újrapárosítás után (új token, ugyanaz az eszköz) a kapcsolat érvényes.
    authServiceMock.validateSocketToken.mockResolvedValue(DEVICE_AUTH);
    const fresh = serverClient('fresh');
    await connect(fresh);

    expect(fresh.disconnect).not.toHaveBeenCalled();
    expect(gateway.isDeviceOnline('device-1')).toBe(true);
    expect(displays()).toBe(1);
  });
});

describe('toMonitorPayload', () => {
  it('kezelésnél a nevet, a kezelést, az alkalomszámot és csak a biztonságos figyelmeztetéseket adja át', () => {
    expect(toMonitorPayload(fullResult())).toEqual({
      status: 'SUCCESS',
      mode: 'TREATMENT_GREETING',
      displayName: 'Kovács Anna',
      serviceName: 'Hypoxi',
      remainingPasses: 1,
      warnings: ['LOW_OCCASIONS'],
      greetingSeconds: 7,
      timestamp: '2026-11-08T10:00:00.000Z',
    });
  });

  it('köredzésnél nincs alkalomszám, kezelés és figyelmeztetés', () => {
    expect(
      toMonitorPayload(fullResult({ mode: 'CIRCUIT_GREETING' })),
    ).toEqual({
      status: 'SUCCESS',
      mode: 'CIRCUIT_GREETING',
      displayName: 'Kovács Anna',
      warnings: [],
      greetingSeconds: 7,
      timestamp: '2026-11-08T10:00:00.000Z',
    });
  });

  it('a sztornózott (CANCELLED) állapot elutasításként, név nélkül jelenik meg', () => {
    const payload = toMonitorPayload(
      fullResult({ status: CheckInStatus.CANCELLED }),
    );
    expect(payload.status).toBe('DENIED');
    expect(payload.displayName).toBeUndefined();
  });
});
