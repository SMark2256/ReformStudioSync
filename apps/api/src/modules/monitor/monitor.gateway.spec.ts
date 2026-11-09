import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
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
