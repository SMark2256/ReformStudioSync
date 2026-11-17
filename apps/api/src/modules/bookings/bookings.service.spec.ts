/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { studioDateTime } from '@reform/shared';
import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BookingEvents } from './booking-events';
import type { BookingNotificationsService } from './booking-notifications.service';
import { BookingsService } from './bookings.service';
import { CalendarSyncService, MAX_SYNC_ATTEMPTS } from './calendar-sync.service';
import type { GoogleCalendarClient } from './google-calendar.client';
import { MAX_GUEST_CODE_ATTEMPTS, PublicBookingService } from './public-booking.service';
import { WaitlistService } from './waitlist.service';

/**
 * TICKET-57: a foglalási motor, a bérletlevonás, a várólista, a nyilvános foglaló és a Google
 * outbox egy memóriabeli Prisma-utánzaton. A `SELECT … FOR UPDATE` zár itt valódi (soronkénti,
 * tranzakció végéig tartó) várakozás, így a párhuzamos foglalás ténylegesen sorba áll.
 */

const ledger = vi.hoisted(() => ({
  recordArrival: vi.fn(),
  recordDeduction: vi.fn(),
  reverseDeduction: vi.fn(),
  voidArrival: vi.fn(),
  logCorrection: vi.fn(),
}));
vi.mock('../passes/pass-ledger', () => ledger);

const STUDIO = 'default-studio';
const MINUTE = 60 * 1000;
/** 2026-11-17, kedd, 11:00 Budapest. */
const NOW = new Date('2026-11-17T10:00:00.000Z');
const DAY = '2026-11-18';
const FAR_DAY = '2026-11-20';

const at = (dayKey: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return studioDateTime(dayKey, h * 60 + m);
};

// ---------------------------------------------------------------------------
// Memóriabeli Prisma
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
const OPERATORS = ['in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'not', 'equals', 'mode', 'startsWith'];
const v = (value: unknown) => (value instanceof Date ? value.getTime() : value);
const isPlainObject = (value: unknown): value is Row =>
  value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

function condition(value: any, c: any): boolean {
  if (c === null) return value === null || value === undefined;
  if (!isPlainObject(c)) return v(value) === v(c);
  if ('in' in c && !c.in.map(v).includes(v(value))) return false;
  if ('notIn' in c && c.notIn.map(v).includes(v(value))) return false;
  if ('not' in c && condition(value, c.not)) return false;
  if ('equals' in c) {
    const insensitive = c.mode === 'insensitive';
    const norm = (x: any) => (insensitive && typeof x === 'string' ? x.toLowerCase() : v(x));
    if (norm(value) !== norm(c.equals)) return false;
  }
  if ('startsWith' in c && !(typeof value === 'string' && value.startsWith(c.startsWith))) return false;
  const cmp = (op: string, test: (a: any, b: any) => boolean) =>
    !(op in c) || (value !== null && value !== undefined && test(v(value), v(c[op])));
  return (
    cmp('lt', (a, b) => a < b) &&
    cmp('lte', (a, b) => a <= b) &&
    cmp('gt', (a, b) => a > b) &&
    cmp('gte', (a, b) => a >= b)
  );
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, c]) => {
    if (key === 'AND') return (c as Row[]).every((w) => matches(row, w));
    if (key === 'OR') return (c as Row[]).some((w) => matches(row, w));
    // Összetett egyedi kulcs (pl. `studioId_name: { studioId, name }`).
    if (isPlainObject(c) && !Object.keys(c).some((k) => OPERATORS.includes(k))) return matches(row, c);
    return condition(row[key], c);
  });
}

function createDb() {
  const state = { now: NOW };
  const lockCalls: { sql: string; values: unknown[] }[] = [];
  const locks = new Map<string, Promise<void>>();

  function model(defaults: () => Row = () => ({})) {
    const rows: Row[] = [];
    const sorted = (list: Row[], orderBy?: Row | Row[]) => {
      const specs = orderBy ? [orderBy].flat() : [];
      return [...list].sort((a, b) => {
        for (const spec of specs) {
          for (const [key, dir] of Object.entries(spec)) {
            const x = v(a[key]) as any;
            const y = v(b[key]) as any;
            if (x === y) continue;
            const r = (x ?? -Infinity) < (y ?? -Infinity) ? -1 : 1;
            return dir === 'desc' ? -r : r;
          }
        }
        return 0;
      });
    };
    const apply = (row: Row, data: Row) => {
      for (const [key, value] of Object.entries(data)) {
        if (isPlainObject(value) && 'increment' in value) row[key] = (row[key] ?? 0) + value.increment;
        else if (value !== undefined) row[key] = value;
      }
      row.updatedAt = new Date(state.now);
      return row;
    };
    const findMany = async ({ where, orderBy, take }: Row = {}) =>
      sorted(rows.filter((r) => matches(r, where)), orderBy)
        .slice(0, take ?? Infinity)
        .map((r) => ({ ...r }));
    const create = async ({ data }: Row) => {
      const row = {
        id: randomUUID(),
        createdAt: new Date(state.now),
        updatedAt: new Date(state.now),
        ...defaults(),
        ...data,
      };
      rows.push(row);
      return { ...row };
    };
    return {
      rows,
      findMany: vi.fn(findMany),
      findFirst: vi.fn(async (args: Row = {}) => (await findMany(args))[0] ?? null),
      findUnique: vi.fn(async ({ where }: Row) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      count: vi.fn(async ({ where }: Row = {}) => rows.filter((r) => matches(r, where)).length),
      create: vi.fn(create),
      update: vi.fn(async ({ where, data }: Row) => {
        const row = rows.find((r) => matches(r, where));
        if (!row) throw new Error('A sor nem található');
        return { ...apply(row, data) };
      }),
      updateMany: vi.fn(async ({ where, data }: Row) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => apply(r, data));
        return { count: hit.length };
      }),
      upsert: vi.fn(async ({ where, create: createData, update }: Row) => {
        const row = rows.find((r) => matches(r, where));
        return row ? { ...apply(row, update) } : create({ data: createData });
      }),
      delete: vi.fn(async ({ where }: Row) => {
        const index = rows.findIndex((r) => matches(r, where));
        if (index < 0) throw new Error('A sor nem található');
        return rows.splice(index, 1)[0];
      }),
      deleteMany: vi.fn(async ({ where }: Row = {}) => {
        const keep = rows.filter((r) => !matches(r, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      }),
    };
  }

  async function acquire(key: string): Promise<() => void> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const chained = previous.then(() => current);
    locks.set(key, chained);
    await previous;
    return () => {
      release();
      if (locks.get(key) === chained) locks.delete(key);
    };
  }

  const db: Row = {
    state,
    lockCalls,
    guest: model(() => ({ isActive: true, gender: 'UNSPECIFIED', email: null, phone: null, notes: null })),
    service: model(() => ({ womenOnly: false })),
    passTemplate: model(),
    guestPass: model(() => ({ isFrozen: false, cancelledAt: null, isActive: true, serviceId: null })),
    passUsageLog: model(() => ({ reversedAt: null, operationKey: null, checkInId: null })),
    loggedCheckIn: model(),
    user: model(),
    auditLog: model(),
    messageLog: model(),
    bookingSettings: model(),
    bookingResource: model(() => ({ isActive: true, sortOrder: 0 })),
    bookableTreatment: model(() => ({ isActive: true, isOnline: true, bufferMinutes: 5 })),
    bookingClosure: model(),
    bookingHolidayOverride: model(),
    booking: model(() => ({
      passUsageId: null,
      deductionSeq: 0,
      googleEventId: null,
      reminderSentAt: null,
      reminderAttempts: 0,
      arrivedAt: null,
      noShowAt: null,
      cancelledAt: null,
      cancelReason: null,
      confirmationSentAt: null,
    })),
    waitlistEntry: model(() => ({
      status: 'WAITING',
      offerStartsAt: null,
      offerExpiresAt: null,
      offerTokenHash: null,
      offeredAt: null,
      bookingId: null,
    })),
    calendarSyncOutbox: model(() => ({
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(state.now),
      lastError: null,
      processedAt: null,
    })),
    guestLoginCode: model(() => ({ attempts: 0, consumedAt: null })),
  };

  db.$transaction = async (arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const held = new Map<string, () => void>();
    const tx = {
      ...db,
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        lockCalls.push({ sql, values });
        const key = `${sql}:${String(values[0])}`;
        if (!held.has(key)) held.set(key, await acquire(key));
        return [];
      },
    };
    try {
      return await arg(tx);
    } finally {
      held.forEach((release) => release());
    }
  };
  return db;
}

// ---------------------------------------------------------------------------
// Törzsadat és szolgáltatások
// ---------------------------------------------------------------------------

function seed(db: Row) {
  const resource = (id: string, name: string, capacity: number) =>
    db.bookingResource.rows.push({ id, studioId: STUDIO, name, capacity, isActive: true, sortOrder: 0 });
  resource('r-hypoxi', 'Hypoxi Trainer', 3);
  resource('r-hiemt', 'HIEMT / Intimpad gép', 1);
  resource('r-ceragem', 'Ceragem', 1);

  const treatment = (id: string, name: string, resourceId: string, durationMinutes: number, sortOrder: number) =>
    db.bookableTreatment.rows.push({
      id,
      studioId: STUDIO,
      name,
      resourceId,
      serviceId: `svc-${id.slice(2)}`,
      durationMinutes,
      bufferMinutes: 5,
      sortOrder,
      isActive: true,
      isOnline: true,
    });
  treatment('t-hypoxi', 'Hypoxi Trainer', 'r-hypoxi', 30, 1);
  treatment('t-hiemt', 'HIEMT', 'r-hiemt', 30, 3);
  treatment('t-intimpad', 'Intimpad', 'r-hiemt', 30, 4);
  treatment('t-ceragem', 'Ceragem', 'r-ceragem', 40, 5);

  for (const [id, lastName, firstName] of [
    ['g1', 'Kiss', 'Anna'],
    ['g2', 'Nagy', 'Béla'],
    ['g3', 'Szabó', 'Cecília'],
    ['g4', 'Tóth', 'Dóra'],
  ]) {
    db.guest.rows.push({
      id,
      studioId: STUDIO,
      barcode: `RS00000${id.slice(1)}`,
      lastName,
      firstName,
      email: `${firstName.toLowerCase()}@example.com`,
      phone: null,
      gender: 'FEMALE',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  }
  db.service.rows.push({ id: 'svc-hypoxi', name: 'Hypoxi', womenOnly: false });
  db.passTemplate.rows.push({ id: 'tpl-hypoxi', name: '10 alkalmas Hypoxi', serviceId: 'svc-hypoxi' });
}

function addPass(db: Row, guestId: string, over: Row = {}) {
  const id = `pass-${guestId}`;
  db.guestPass.rows.push({
    id,
    guestId,
    passTemplateId: 'tpl-hypoxi',
    type: 'OCCASION_BASED',
    totalPasses: 10,
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    expirationDate: new Date('2026-12-31T00:00:00.000Z'),
    isFrozen: false,
    cancelledAt: null,
    serviceId: 'svc-hypoxi',
    isActive: true,
    ...over,
  });
  return id;
}

function setup(options: { googleConfigured?: boolean } = {}) {
  const db = createDb();
  seed(db);
  const prisma = db as unknown as PrismaService;
  const config = {
    get: (key: string) => ({ JWT_SECRET: 'test-secret', NODE_ENV: 'test' })[key as 'JWT_SECRET'],
  } as unknown as ConfigService;
  const notifications = {
    sendConfirmation: vi.fn(async () => undefined),
    sendRescheduled: vi.fn(async () => undefined),
    sendCancelled: vi.fn(async () => undefined),
    sendWaitlistOffer: vi.fn(async () => undefined),
    sendGuestCode: vi.fn(async () => 'SENT' as const),
  };
  const events = { changed: vi.fn() } as unknown as BookingEvents;
  const google = {
    isConfigured: options.googleConfigured ?? false,
    upsertEvent: vi.fn(async () => undefined),
    deleteEvent: vi.fn(async () => undefined),
  };
  const calendarSync = new CalendarSyncService(prisma, google as unknown as GoogleCalendarClient);
  const typedNotifications = notifications as unknown as BookingNotificationsService;
  const waitlist = new WaitlistService(prisma, typedNotifications, calendarSync, events, config);
  const bookings = new BookingsService(prisma, typedNotifications, calendarSync, waitlist, events, config);
  const publicBooking = new PublicBookingService(
    prisma,
    bookings,
    typedNotifications,
    calendarSync,
    waitlist,
    events,
    config,
  );
  return { db, bookings, waitlist, publicBooking, calendarSync, notifications, google };
}

const staffBook = (
  bookings: BookingsService,
  guestId: string,
  treatmentIds: string[],
  startsAt: Date,
  overrideRules?: boolean,
) => bookings.create(STUDIO, { guestId, treatmentIds, startsAt: startsAt.toISOString(), overrideRules }, 'staff-1', NOW);

beforeEach(() => {
  vi.clearAllMocks();
  ledger.recordArrival.mockImplementation(async () => ({ id: 'checkin-1' }));
  ledger.recordDeduction.mockImplementation(async (tx: any, pass: any, opts: any) => {
    const usage = await tx.passUsageLog.create({
      data: {
        guestPassId: pass.id,
        guestId: opts.guestId,
        serviceId: opts.serviceId,
        delta: -1,
        operationKey: opts.operationKey,
        checkInId: opts.checkInId,
        usedAt: NOW,
      },
    });
    return { usageId: usage.id, remaining: (pass.remainingPasses ?? 0) - 1 };
  });
  ledger.reverseDeduction.mockImplementation(async (tx: any, { id }: any) => {
    await tx.passUsageLog.update({ where: { id }, data: { reversedAt: NOW } });
    return 10;
  });
});

// ---------------------------------------------------------------------------
// Foglalási motor
// ---------------------------------------------------------------------------

describe('foglalás: kapacitás, közös gép, önátfedés', () => {
  it('Hypoxi: a negyedik egyidejű foglalás elutasítva', async () => {
    const { bookings } = setup();
    const start = at(DAY, '09:00');
    for (const guest of ['g1', 'g2', 'g3']) await staffBook(bookings, guest, ['t-hypoxi'], start);
    await expect(staffBook(bookings, 'g4', ['t-hypoxi'], start)).rejects.toMatchObject({
      code: 'BOOKING.CAPACITY_FULL',
    });
  });

  it('HIEMT és Intimpad közös 1 fős gépen, a szünettel együtt', async () => {
    const { bookings } = setup();
    await staffBook(bookings, 'g1', ['t-hiemt'], at(DAY, '09:00'));
    await expect(staffBook(bookings, 'g2', ['t-intimpad'], at(DAY, '09:30'))).rejects.toMatchObject({
      code: 'BOOKING.CAPACITY_FULL',
    });
    const ok = await staffBook(bookings, 'g2', ['t-intimpad'], at(DAY, '09:35'));
    expect(ok.bookings[0].resourceId).toBe('r-hiemt');
  });

  it('a vendég önátfedése tiltott', async () => {
    const { bookings } = setup();
    await staffBook(bookings, 'g1', ['t-hypoxi'], at(DAY, '09:00'));
    await expect(staffBook(bookings, 'g1', ['t-ceragem'], at(DAY, '09:15'))).rejects.toMatchObject({
      code: 'BOOKING.GUEST_OVERLAP',
    });
  });

  it('párhuzamos foglalás: a gép zárolva, a második kérés elutasítva', async () => {
    const { bookings, db } = setup();
    const start = at(DAY, '09:00');
    const results = await Promise.allSettled([
      staffBook(bookings, 'g1', ['t-ceragem'], start),
      staffBook(bookings, 'g2', ['t-ceragem'], start),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'BOOKING.CAPACITY_FULL' });
    expect(db.booking.rows).toHaveLength(1);
    const resourceLocks = db.lockCalls.filter(
      (c: { sql: string; values: unknown[] }) => c.sql.includes('"booking_resources"') && c.sql.includes('FOR UPDATE'),
    );
    expect(resourceLocks.length).toBeGreaterThanOrEqual(2);
    expect(resourceLocks.every((c: { values: unknown[] }) => c.values[0] === 'r-ceragem')).toBe(true);
  });

  it('a recepció felülírja a 30 perces korlátot, a kapacitást nem', async () => {
    const { bookings } = setup();
    const soon = new Date(NOW.getTime() + 10 * MINUTE);
    await expect(staffBook(bookings, 'g1', ['t-ceragem'], soon)).rejects.toMatchObject({ code: 'BOOKING.TOO_LATE' });
    await staffBook(bookings, 'g1', ['t-ceragem'], soon, true);
    await expect(staffBook(bookings, 'g2', ['t-ceragem'], soon, true)).rejects.toMatchObject({
      code: 'BOOKING.CAPACITY_FULL',
    });
  });

  it('többkezeléses foglalás egy csoportban; részleges lemondásnál a többi megmarad', async () => {
    const { bookings, db } = setup();
    const created = await staffBook(bookings, 'g1', ['t-ceragem', 't-hypoxi'], at(FAR_DAY, '10:00'));
    expect(created.bookings.map((b) => b.treatmentId)).toEqual(['t-hypoxi', 't-ceragem']);
    expect(new Set(created.bookings.map((b) => b.groupId)).size).toBe(1);
    expect(created.bookings[1].startsAt).toBe(created.bookings[0].endsAt);

    const [hypoxi, ceragem] = created.bookings;
    const cancelled = await bookings.cancel(STUDIO, hypoxi.id, { reason: 'Beteg' }, 'staff-1', NOW);
    expect(cancelled.status).toBe('CANCELLED');
    expect(db.booking.rows.find((b: Row) => b.id === ceragem.id).status).toBe('CONFIRMED');
    await expect(bookings.cancel(STUDIO, hypoxi.id, {}, 'staff-1', NOW)).rejects.toMatchObject({
      code: 'BOOKING.ALREADY_CANCELLED',
    });
  });

  it('áthelyezés: a saját foglalás nem foglaltság, a foglalt időpont igen', async () => {
    const { bookings } = setup();
    const own = (await staffBook(bookings, 'g1', ['t-ceragem'], at(FAR_DAY, '09:00'))).bookings[0];
    await staffBook(bookings, 'g2', ['t-ceragem'], at(FAR_DAY, '11:00'));
    const moved = await bookings.reschedule(STUDIO, own.id, { startsAt: at(FAR_DAY, '09:15').toISOString() }, 'staff-1', NOW);
    expect(moved.startsAt).toBe(at(FAR_DAY, '09:15').toISOString());
    await expect(
      bookings.reschedule(STUDIO, own.id, { startsAt: at(FAR_DAY, '11:00').toISOString() }, 'staff-1', NOW),
    ).rejects.toMatchObject({ code: 'BOOKING.CAPACITY_FULL' });
  });

  it('a rendkívüli zárvatartás csak jelez: listázza az érintetteket, a foglalás marad', async () => {
    const { bookings, db } = setup();
    const booked = (await staffBook(bookings, 'g1', ['t-hypoxi'], at(DAY, '09:00'))).bookings[0];
    const result = await bookings.createClosure(
      STUDIO,
      { startsAt: at(DAY, '08:00').toISOString(), endsAt: at(DAY, '10:00').toISOString(), reason: 'Áramszünet' },
      'staff-1',
    );
    expect(result.affectedBookings.map((b) => b.id)).toEqual([booked.id]);
    expect(db.booking.rows.find((b: Row) => b.id === booked.id).status).toBe('CONFIRMED');
    // Új foglalás a zárvatartásba már nem kerülhet.
    await expect(staffBook(bookings, 'g2', ['t-ceragem'], at(DAY, '09:00'))).rejects.toMatchObject({
      code: 'BOOKING.CLOSED',
    });
  });
});

// ---------------------------------------------------------------------------
// Bérletlevonás
// ---------------------------------------------------------------------------

describe('bérletlevonás megérkezéskor és „Nem jelent meg”-nél', () => {
  const book = async (ctx: ReturnType<typeof setup>, guestId: string) =>
    (await staffBook(ctx.bookings, guestId, ['t-hypoxi'], at(DAY, '09:00'))).bookings[0];
  const setStatus = (ctx: ReturnType<typeof setup>, id: string, status: string) =>
    ctx.bookings.setStatus(STUDIO, id, { status: status as any }, 'staff-1', NOW);

  it('foglaláskor nincs levonás, csak figyelmeztetés', async () => {
    const ctx = setup();
    const created = await staffBook(ctx.bookings, 'g1', ['t-hypoxi'], at(DAY, '09:00'));
    expect(created.warnings).toEqual([{ treatmentId: 't-hypoxi', treatmentName: 'Hypoxi Trainer', warning: 'NO_PASS' }]);
    expect(ledger.recordDeduction).not.toHaveBeenCalled();
  });

  it('megérkezés: pontosan egy levonás, ismétlésre és utólagos no-show-ra sem kettő', async () => {
    const ctx = setup();
    addPass(ctx.db, 'g1');
    const booking = await book(ctx, 'g1');

    const first = await setStatus(ctx, booking.id, 'ARRIVED');
    expect(first.deduction).toBe('DEDUCTED');
    expect(first.booking.deducted).toBe(true);
    expect((await setStatus(ctx, booking.id, 'ARRIVED')).deduction).toBe('ALREADY_DEDUCTED');
    expect((await setStatus(ctx, booking.id, 'NO_SHOW')).deduction).toBe('ALREADY_DEDUCTED');
    expect(ledger.recordDeduction).toHaveBeenCalledTimes(1);
    expect(ledger.recordArrival).toHaveBeenCalledTimes(1);
    expect(ctx.db.passUsageLog.rows).toHaveLength(1);
  });

  it('„Nem jelent meg”: automatikus levonás beléptetés nélkül, idempotenciakulccsal', async () => {
    const ctx = setup();
    addPass(ctx.db, 'g2');
    const booking = await book(ctx, 'g2');
    const result = await setStatus(ctx, booking.id, 'NO_SHOW');
    expect(result.deduction).toBe('DEDUCTED');
    expect(ledger.recordArrival).not.toHaveBeenCalled();
    expect(ctx.db.passUsageLog.rows[0].operationKey).toBe(`booking:${booking.id}:0`);
  });

  it('visszaállítás sztornózza a levonást; az új levonás új kulcsot kap', async () => {
    const ctx = setup();
    addPass(ctx.db, 'g1');
    const booking = await book(ctx, 'g1');
    await setStatus(ctx, booking.id, 'ARRIVED');
    const reverted = await setStatus(ctx, booking.id, 'CONFIRMED');
    expect(reverted.deduction).toBe('REVERSED');
    expect(reverted.booking.deducted).toBe(false);
    expect(ledger.reverseDeduction).toHaveBeenCalledTimes(1);

    await setStatus(ctx, booking.id, 'ARRIVED');
    expect(ledger.recordDeduction).toHaveBeenCalledTimes(2);
    expect(ctx.db.passUsageLog.rows.map((u: Row) => u.operationKey)).toEqual([
      `booking:${booking.id}:0`,
      `booking:${booking.id}:1`,
    ]);
  });

  it.each([
    ['hiányzó bérlet', null],
    ['0 alkalmas bérlet', { totalPasses: 1, used: true }],
    ['lejárt bérlet', { expirationDate: new Date('2026-11-10T00:00:00.000Z') }],
  ])('%s: nincs levonás és nincs tartozás, az állapot rögzül', async (_label, pass) => {
    const ctx = setup();
    if (pass) {
      const { used, ...over } = pass as Row;
      const passId = addPass(ctx.db, 'g3', over);
      if (used) ctx.db.passUsageLog.rows.push({ id: 'old', guestPassId: passId, delta: -1, reversedAt: null });
    }
    const booking = await book(ctx, 'g3');
    const result = await setStatus(ctx, booking.id, 'NO_SHOW');
    expect(result.deduction).toBe('NO_USABLE_PASS');
    expect(result.booking.status).toBe('NO_SHOW');
    expect(ledger.recordDeduction).not.toHaveBeenCalled();
  });

  it('lemondani a műveletet nem lehet az állapotváltással', async () => {
    const ctx = setup();
    const booking = await book(ctx, 'g1');
    await expect(setStatus(ctx, booking.id, 'CANCELLED')).rejects.toMatchObject({
      code: 'BOOKING.INVALID_STATUS_CHANGE',
    });
  });
});

// ---------------------------------------------------------------------------
// Várólista
// ---------------------------------------------------------------------------

describe('várólista', () => {
  it('a legrégebben várakozó kap ajánlatot és 30 perces tartást; lejáratkor a következő jön', async () => {
    const ctx = setup();
    // A Ceragem 09:00–09:45 foglalt; az idősávban (09:00–10:00) csak a 09:45 szabad.
    await staffBook(ctx.bookings, 'g3', ['t-ceragem'], at(DAY, '09:00'));
    const join = (guestId: string) =>
      ctx.waitlist.join(
        {
          studioId: STUDIO,
          guestId,
          treatmentId: 't-ceragem',
          dayKey: DAY,
          fromMinutes: 9 * 60,
          toMinutes: 10 * 60,
          actorUserId: 'staff-1',
        },
        NOW,
      );
    await join('g1');
    ctx.db.state.now = new Date(NOW.getTime() + MINUTE);
    await join('g2');

    const entry = (guestId: string) => ctx.db.waitlistEntry.rows.find((e: Row) => e.guestId === guestId);
    expect(entry('g1')).toMatchObject({ status: 'OFFERED', offerStartsAt: at(DAY, '09:45') });
    expect(entry('g1').offerExpiresAt.getTime()).toBe(NOW.getTime() + 30 * MINUTE);
    expect(entry('g1').offerTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry('g2').status).toBe('WAITING');

    // A tartás beszámít a kapacitásba.
    const availability = await ctx.bookings.availability(
      { studioId: STUDIO, dayKey: DAY, treatmentIds: ['t-ceragem'] },
      NOW,
    );
    expect(availability.slots.map((s) => s.startsAt)).not.toContain(at(DAY, '09:45').toISOString());
    await expect(staffBook(ctx.bookings, 'g4', ['t-ceragem'], at(DAY, '09:45'))).rejects.toMatchObject({
      code: 'BOOKING.CAPACITY_FULL',
    });

    // Lejárat: a következő várakozó kapja meg.
    const later = new Date(NOW.getTime() + 31 * MINUTE);
    expect(await ctx.waitlist.expireOffers(later)).toBe(1);
    expect(entry('g1').status).toBe('EXPIRED');
    expect(entry('g2')).toMatchObject({ status: 'OFFERED', offerStartsAt: at(DAY, '09:45') });
    expect(entry('g2').offerExpiresAt.getTime()).toBe(later.getTime() + 30 * MINUTE);
    expect(ctx.notifications.sendWaitlistOffer).toHaveBeenCalledTimes(2);
  });

  it('a lejárat ismételhető: második futás nem ad új ajánlatot', async () => {
    const ctx = setup();
    await ctx.waitlist.join(
      { studioId: STUDIO, guestId: 'g1', treatmentId: 't-ceragem', dayKey: DAY, fromMinutes: 540, toMinutes: 600, actorUserId: null },
      NOW,
    );
    const later = new Date(NOW.getTime() + 31 * MINUTE);
    expect(await ctx.waitlist.expireOffers(later)).toBe(1);
    expect(await ctx.waitlist.expireOffers(later)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Nyilvános foglaló: vendégkód, kezelőlink
// ---------------------------------------------------------------------------

describe('nyilvános foglaló', () => {
  const contact = { lastName: 'Kiss', firstName: 'Anna', email: 'ANNA@example.com', phone: '+36 30 123 4567' };

  it('bejelentkezés nélkül a meglévő profilhoz kapcsol (duplikáció nélkül), bérletadat nélkül', async () => {
    const { publicBooking, db } = setup();
    const guests = db.guest.rows.length;
    const result = await publicBooking.create(
      { treatmentIds: ['t-hypoxi'], startsAt: at(FAR_DAY, '09:00').toISOString(), contact, privacyAccepted: true },
      undefined,
      NOW,
    );
    expect(db.guest.rows).toHaveLength(guests);
    expect(db.booking.rows[0]).toMatchObject({ guestId: 'g1', source: 'ONLINE' });
    expect(result.passWarnings).toEqual([]);
    expect(result.bookings[0].manageToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    // Csak a hash van tárolva.
    expect(db.booking.rows[0].manageTokenHash).not.toBe(result.bookings[0].manageToken);
  });

  it('új e-mail címmel új profil jön létre; adatkezelési hozzájárulás nélkül nincs foglalás', async () => {
    const { publicBooking, db } = setup();
    const body = {
      treatmentIds: ['t-hypoxi'],
      startsAt: at(FAR_DAY, '09:00').toISOString(),
      contact: { ...contact, email: 'uj.vendeg@example.com', firstName: 'Új' },
    };
    await expect(publicBooking.create({ ...body, privacyAccepted: false }, undefined, NOW)).rejects.toMatchObject({
      code: 'BOOKING.PRIVACY_REQUIRED',
    });
    await publicBooking.create({ ...body, privacyAccepted: true }, undefined, NOW);
    const created = db.guest.rows.find((g: Row) => g.email === 'uj.vendeg@example.com');
    expect(created.barcode).toMatch(/^RS\d{6}$/);
  });

  it('online csak a 30 perces és a 30 napos korláton belül', async () => {
    const { publicBooking } = setup();
    const body = (startsAt: Date) => ({ treatmentIds: ['t-hypoxi'], startsAt: startsAt.toISOString(), contact, privacyAccepted: true });
    await expect(publicBooking.create(body(new Date(NOW.getTime() + 10 * MINUTE)), undefined, NOW)).rejects.toMatchObject({
      code: 'BOOKING.TOO_LATE',
    });
    await expect(publicBooking.create(body(at('2026-12-21', '09:00')), undefined, NOW)).rejects.toMatchObject({
      code: 'BOOKING.TOO_FAR',
    });
  });

  it('kezelőlink: csak érvényes tokennel; online lemondás 24 órán belül nem, azon kívül igen', async () => {
    const { publicBooking } = setup();
    const create = async (startsAt: Date) =>
      (await publicBooking.create({ treatmentIds: ['t-ceragem'], startsAt: startsAt.toISOString(), contact, privacyAccepted: true }, undefined, NOW))
        .bookings[0];
    const soon = await create(at(DAY, '09:00'));
    const far = await create(at(FAR_DAY, '09:00'));

    const managed = await publicBooking.getManaged(far.manageToken, NOW);
    expect(managed).toMatchObject({ id: far.id, guestFirstName: 'Anna', canChange: true });
    expect(managed).not.toHaveProperty('guestEmail');

    await expect(publicBooking.getManaged('rovid', NOW)).rejects.toMatchObject({ code: 'BOOKING.LINK_INVALID' });
    await expect(publicBooking.getManaged('x'.repeat(43), NOW)).rejects.toMatchObject({ code: 'BOOKING.LINK_INVALID' });

    expect((await publicBooking.getManaged(soon.manageToken, NOW)).canChange).toBe(false);
    await expect(publicBooking.cancelManaged(soon.manageToken, NOW)).rejects.toMatchObject({
      code: 'BOOKING.CHANGE_CUTOFF',
    });
    const cancelled = await publicBooking.cancelManaged(far.manageToken, NOW);
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('vendégkód: hash-elve, egyszer használható, próbálkozás- és kéréskorláttal', async () => {
    const { publicBooking, notifications, db } = setup();
    await publicBooking.requestCode({ email: 'Anna@Example.com' }, NOW);
    const code = (notifications.sendGuestCode.mock.calls[0] as unknown[])[1] as string;
    expect(code).toMatch(/^\d{6}$/);
    expect(db.guestLoginCode.rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);

    // Percen belül újabb kód nem kérhető.
    await expect(publicBooking.requestCode({ email: 'anna@example.com' }, NOW)).rejects.toMatchObject({
      code: 'BOOKING.GUEST_CODE_RATE_LIMITED',
    });

    const wrong = code === '000000' ? '111111' : '000000';
    await expect(publicBooking.verifyCode({ email: 'anna@example.com', code: wrong }, NOW)).rejects.toMatchObject({
      code: 'BOOKING.GUEST_CODE_INVALID',
    });
    const login = await publicBooking.verifyCode({ email: 'anna@example.com', code }, NOW);
    expect(login.profile).toMatchObject({ firstName: 'Anna', email: 'anna@example.com' });
    // Egyszer használható.
    await expect(publicBooking.verifyCode({ email: 'anna@example.com', code }, NOW)).rejects.toMatchObject({
      code: 'BOOKING.GUEST_CODE_INVALID',
    });

    // A munkamenet: hamisítva vagy lejárva érvénytelen.
    expect((await publicBooking.profile(login.guestToken, NOW)).firstName).toBe('Anna');
    const forged = login.guestToken.replace(/^g1\./, 'g2.');
    await expect(publicBooking.profile(forged, NOW)).rejects.toMatchObject({ code: 'BOOKING.GUEST_SESSION_INVALID' });
    await expect(publicBooking.profile(login.guestToken, new Date(NOW.getTime() + 3 * 60 * MINUTE))).rejects.toMatchObject({
      code: 'BOOKING.GUEST_SESSION_INVALID',
    });
    await expect(publicBooking.profile(undefined, NOW)).rejects.toMatchObject({ code: 'BOOKING.GUEST_SESSION_INVALID' });
  });

  it('vendégkód: a túl sok hibás próbálkozás után a jó kód sem érvényes', async () => {
    const { publicBooking, notifications } = setup();
    await publicBooking.requestCode({ email: 'anna@example.com' }, NOW);
    const code = (notifications.sendGuestCode.mock.calls[0] as unknown[])[1] as string;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_GUEST_CODE_ATTEMPTS; i++) {
      await expect(publicBooking.verifyCode({ email: 'anna@example.com', code: wrong }, NOW)).rejects.toMatchObject({
        code: 'BOOKING.GUEST_CODE_INVALID',
      });
    }
    await expect(publicBooking.verifyCode({ email: 'anna@example.com', code }, NOW)).rejects.toMatchObject({
      code: 'BOOKING.GUEST_CODE_INVALID',
    });
  });

  it('ismeretlen címre ugyanaz a válasz, levél és használható kód nélkül', async () => {
    const { publicBooking, notifications, db } = setup();
    await expect(publicBooking.requestCode({ email: 'senki@example.com' }, NOW)).resolves.toEqual({ ok: true });
    expect(notifications.sendGuestCode).not.toHaveBeenCalled();
    expect(db.guestLoginCode.rows[0].codeHash).toMatch(/^unusable:/);
  });

  it('bejelentkezve látja a bérlet-figyelmeztetést, és nem kell kapcsolati adat', async () => {
    const { publicBooking, notifications } = setup();
    await publicBooking.requestCode({ email: 'anna@example.com' }, NOW);
    const code = (notifications.sendGuestCode.mock.calls[0] as unknown[])[1] as string;
    const { guestToken } = await publicBooking.verifyCode({ email: 'anna@example.com', code }, NOW);
    const result = await publicBooking.create(
      { treatmentIds: ['t-hypoxi'], startsAt: at(FAR_DAY, '09:00').toISOString(), privacyAccepted: true },
      guestToken,
      NOW,
    );
    expect(result.passWarnings.map((w) => w.warning)).toEqual(['NO_PASS']);
  });
});

// ---------------------------------------------------------------------------
// Google Naptár outbox
// ---------------------------------------------------------------------------

describe('Google Naptár outbox', () => {
  const bookingRow = (db: Row) => {
    db.booking.rows.push({
      id: 'b-sync',
      studioId: STUDIO,
      groupId: 'grp',
      guestId: 'g1',
      treatmentId: 't-hypoxi',
      resourceId: 'r-hypoxi',
      startsAt: at(DAY, '09:00'),
      endsAt: at(DAY, '09:30'),
      blockedUntil: at(DAY, '09:35'),
      status: 'CONFIRMED',
      googleEventId: null,
    });
  };

  it('beállítás nélkül nem nő a sor, nincs hiba, „nincs beállítva” állapot', async () => {
    const { calendarSync, db } = setup();
    bookingRow(db);
    await db.$transaction((tx: any) => calendarSync.enqueue(tx, STUDIO, ['b-sync'], 'UPSERT'));
    expect(db.calendarSyncOutbox.rows).toHaveLength(0);
    await expect(calendarSync.processDue(NOW)).resolves.toEqual({ done: 0, failed: 0 });
    expect(await calendarSync.status(STUDIO)).toMatchObject({ configured: false, pending: 0, failed: 0 });
  });

  it('foglalásonként egy függő tétel; siker után DONE és külső eseményazonosító', async () => {
    const { calendarSync, db, google } = setup({ googleConfigured: true });
    bookingRow(db);
    await db.$transaction((tx: any) => calendarSync.enqueue(tx, STUDIO, ['b-sync'], 'UPSERT'));
    await db.$transaction((tx: any) => calendarSync.enqueue(tx, STUDIO, ['b-sync'], 'UPSERT'));
    expect(db.calendarSyncOutbox.rows).toHaveLength(1);

    expect(await calendarSync.processDue(NOW)).toEqual({ done: 1, failed: 0 });
    expect(google.upsertEvent).toHaveBeenCalledTimes(1);
    const eventId = (google.upsertEvent.mock.calls[0] as unknown[])[0] as string;
    expect(db.booking.rows[0].googleEventId).toBe(eventId);
    expect(db.calendarSyncOutbox.rows[0].status).toBe('DONE');
  });

  it('hibánál késleltetett újrapróbálás, a korlát után FAILED, a recepció újrapróbálhatja', async () => {
    const { calendarSync, db, google } = setup({ googleConfigured: true });
    bookingRow(db);
    google.upsertEvent.mockRejectedValue(new Error('Google Naptár hiba (HTTP 500)'));
    await db.$transaction((tx: any) => calendarSync.enqueue(tx, STUDIO, ['b-sync'], 'UPSERT'));

    await calendarSync.processDue(NOW);
    const item = db.calendarSyncOutbox.rows[0];
    expect(item).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'Google Naptár hiba (HTTP 500)' });
    expect(item.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());
    // Még nem esedékes: nincs újabb hívás.
    await calendarSync.processDue(NOW);
    expect(google.upsertEvent).toHaveBeenCalledTimes(1);

    let now = NOW;
    while (item.status === 'PENDING') {
      now = new Date(item.nextAttemptAt.getTime());
      await calendarSync.processDue(now);
    }
    expect(item).toMatchObject({ status: 'FAILED', attempts: MAX_SYNC_ATTEMPTS });
    expect(await calendarSync.status(STUDIO)).toMatchObject({ configured: true, failed: 1 });
    expect(await calendarSync.retryFailed(STUDIO)).toBe(1);
    expect(item).toMatchObject({ status: 'PENDING', attempts: 0 });
  });
});
