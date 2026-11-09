/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computeRemainingPasses,
  getPassStatus,
  PassStatus,
  PassType,
  toStudioDayKey,
} from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInsService } from '../check-ins/check-ins.service';
import { FinanceService } from '../finance/finance.service';
import { PassesService } from './passes.service';

/**
 * TICKET-16: bérlet-alkalom egyetlen forrásból. Kis memóriabeli Prisma-utánzat, amely pontosan
 * azokat a lekérdezés-alakokat ismeri, amelyeket a levonás / visszavonás / sztornó használ, így a
 * két végpont egymásra hatása valódi állapoton ellenőrizhető.
 */

const DAY = 24 * 60 * 60 * 1000;
const STUDIO = 'default-studio';

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as any;
      if ('gt' in c && !(value > c.gt)) return false;
      if ('lt' in c && !(value < c.lt)) return false;
      if ('gte' in c && !(value >= c.gte)) return false;
      return true;
    }
    if (cond === null) return value === null || value === undefined;
    return value === cond;
  });
}

function applyData(row: any, data: any) {
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === 'object' && 'increment' in (val as any)) {
      row[key] = (row[key] ?? 0) + (val as any).increment;
    } else if (val && typeof val === 'object' && 'decrement' in (val as any)) {
      row[key] = (row[key] ?? 0) - (val as any).decrement;
    } else {
      row[key] = val;
    }
  }
}

function createDb() {
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;
  const t = {
    guests: [] as any[],
    services: [] as any[],
    templates: [] as any[],
    passes: [] as any[],
    usages: [] as any[],
    checkIns: [] as any[],
    visits: [] as any[],
    audits: [] as any[],
    payments: [] as any[],
  };

  const passWith = (p: any, include: any = {}) => ({
    ...p,
    ...(include.passTemplate
      ? { passTemplate: t.templates.find((x) => x.id === p.passTemplateId) }
      : {}),
    ...(include.usageLogs
      ? { usageLogs: t.usages.filter((u) => u.guestPassId === p.id) }
      : {}),
    ...(include.guest ? { guest: t.guests.find((g) => g.id === p.guestId) } : {}),
  });

  const tx: any = {
    guest: {
      findFirst: async ({ where }: any) =>
        t.guests.find((g) => matches(g, where)) ?? null,
      findUnique: async ({ where }: any) => {
        const g = t.guests.find(
          (x) =>
            x.studioId === where.studioId_barcode.studioId &&
            x.barcode === where.studioId_barcode.barcode,
        );
        if (!g) return null;
        return {
          ...g,
          memberships: [],
          passes: t.passes
            .filter((p) => p.guestId === g.id)
            .map((p) => passWith(p, { passTemplate: true })),
        };
      },
    },
    service: {
      findFirst: async ({ where }: any) =>
        t.services.find((s) => matches(s, where)) ?? null,
    },
    guestPass: {
      findFirst: async ({ where, include }: any) => {
        const p = t.passes.find((x) => matches(x, where));
        return p ? passWith(p, include) : null;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = t.passes.filter((x) => matches(x, where));
        rows.forEach((r) => applyData(r, data));
        return { count: rows.length };
      },
      update: async ({ where, data }: any) => {
        const row = t.passes.find((x) => x.id === where.id);
        applyData(row, data);
        return { ...row };
      },
    },
    passUsageLog: {
      findUnique: async ({ where }: any) =>
        t.usages.find((u) => u.operationKey && u.operationKey === where.operationKey) ??
        null,
      findFirst: async ({ where }: any) => {
        const u = t.usages.find((x) => matches(x, where));
        if (!u) return null;
        return {
          ...u,
          guestPass: passWith(
            t.passes.find((p) => p.id === u.guestPassId),
            { guest: true, passTemplate: true },
          ),
          service: t.services.find((s) => s.id === u.serviceId) ?? null,
          checkIn: t.checkIns.find((c) => c.id === u.checkInId) ?? null,
        };
      },
      create: async ({ data }: any) => {
        const row = { id: id('usage'), usedAt: new Date(), reversedAt: null, ...data };
        t.usages.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = t.usages.filter((x) => matches(x, where));
        rows.forEach((r) => applyData(r, data));
        return { count: rows.length };
      },
    },
    loggedCheckIn: {
      findUnique: async () => null,
      findFirst: async ({ where, include }: any) => {
        const c = t.checkIns.find((x) => matches(x, where));
        if (!c) return null;
        if (!include?.passUsage) return { ...c, guestPass: null };
        const usage = t.usages.find((u) => u.checkInId === c.id);
        return {
          ...c,
          guest: t.guests.find((g) => g.id === c.guestId),
          guestPass: t.passes.find((p) => p.id === c.guestPassId) ?? null,
          passUsage: usage
            ? { ...usage, guestPass: t.passes.find((p) => p.id === usage.guestPassId) }
            : null,
        };
      },
      create: async ({ data }: any) => {
        const row = { id: id('chk'), createdAt: new Date(), ...data };
        t.checkIns.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = t.checkIns.filter((x) => matches(x, where));
        rows.forEach((r) => applyData(r, data));
        return { count: rows.length };
      },
    },
    visit: {
      create: async ({ data }: any) => {
        const row = { id: id('visit'), checkedInAt: new Date(), ...data };
        t.visits.push(row);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        const before = t.visits.length;
        t.visits = t.visits.filter((v) => v.id !== where.id);
        return { count: before - t.visits.length };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        t.audits.push({ id: id('audit'), createdAt: new Date(), ...data });
        return t.audits[t.audits.length - 1];
      },
    },
    payment: {
      findFirst: async ({ where, orderBy }: any) => {
        const rows = t.payments.filter((x) => matches(x, where));
        if (orderBy) rows.sort((a, b) => a.createdAt - b.createdAt);
        const p = rows[0];
        if (!p) return null;
        return {
          ...p,
          guest: t.guests.find((g) => g.id === p.guestId),
          guestPass: null,
          recordedBy: { name: 'Recepció' },
          allocations: [],
        };
      },
      update: async ({ where, data }: any) => {
        const row = t.payments.find((x) => x.id === where.id);
        applyData(row, data);
        return {
          ...row,
          guest: t.guests.find((g) => g.id === row.guestId),
          guestPass: null,
          recordedBy: { name: 'Recepció' },
        };
      },
    },
  };

  const prisma: any = { $transaction: async (cb: any) => cb(tx) };
  return { t, prisma };
}

describe('TICKET-16 — Bérlet-alkalom egyetlen forrásból, sztornó és visszavonás egységesítése', () => {
  let db: ReturnType<typeof createDb>;
  let passes: PassesService;
  let checkIns: CheckInsService;
  let finance: FinanceService;

  const monitor = { emitCheckInResult: vi.fn(), emitCheckInRevoked: vi.fn() };

  const addPass = (over: Partial<any> = {}) => {
    const pass = {
      id: `pass-${db.t.passes.length + 1}`,
      studioId: STUDIO,
      guestId: 'guest-1',
      passTemplateId: 'tpl-hypoxi',
      serviceId: 'srv-hypoxi',
      type: 'OCCASION_BASED',
      totalPasses: 10,
      remainingPasses: 10,
      startDate: new Date(Date.now() - 5 * DAY),
      expirationDate: new Date(Date.now() + 30 * DAY),
      isActive: true,
      isFrozen: false,
      frozenAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      ...over,
    };
    db.t.passes.push(pass);
    return pass;
  };

  /** Az invariáns: remainingPasses mező = összes − nem visszavont levonások. */
  const expectLedgerConsistent = (pass: any) => {
    const logs = db.t.usages.filter((u) => u.guestPassId === pass.id);
    expect(pass.remainingPasses).toBe(computeRemainingPasses(pass.totalPasses, logs));
  };

  const deduct = (passId: string, serviceId = 'srv-hypoxi') =>
    passes.deductTreatmentUsage(
      { guestId: 'guest-1', passId, serviceId },
      'staff-1',
      STUDIO,
    );

  beforeEach(() => {
    db = createDb();
    db.t.guests.push({
      id: 'guest-1',
      studioId: STUDIO,
      barcode: 'RS100001',
      firstName: 'Anna',
      lastName: 'Kovács',
      isActive: true,
    });
    db.t.services.push(
      { id: 'srv-hypoxi', studioId: STUDIO, name: 'Hypoxi' },
      { id: 'srv-face', studioId: STUDIO, name: 'Arckezelés' },
    );
    db.t.templates.push(
      { id: 'tpl-hypoxi', name: '10 Alkalmas Hypoxi', serviceId: 'srv-hypoxi' },
      { id: 'tpl-general', name: '10 Alkalmas Bérlet', serviceId: null },
      { id: 'tpl-unlimited', name: 'Havi Korlátlan', serviceId: null },
    );
    passes = new PassesService(db.prisma, monitor as any);
    checkIns = new CheckInsService(db.prisma, monitor as any);
    finance = new FinanceService(db.prisma);
  });

  it('levonás → beléptetés-sztornó → levonás-visszavonás: csak egyszer ír jóvá', async () => {
    const pass = addPass();
    const res = await deduct(pass.id);
    expect(res.remainingPasses).toBe(9);
    expect(db.t.visits).toHaveLength(1);
    expectLedgerConsistent(pass);

    const revoked = await checkIns.revokeCheckIn(res.checkInId!, 'staff-2', STUDIO, 'Rossz vendég');
    expect(revoked.restoredRemainingPasses).toBe(10);
    expectLedgerConsistent(pass);

    await expect(
      passes.reversePassUsage(res.usageId!, { reversalReason: 'Még egyszer' }, 'staff-1', STUDIO),
    ).rejects.toMatchObject({ code: 'PASS.USAGE_ALREADY_REVERSED' });

    expect(pass.remainingPasses).toBe(10);
    expectLedgerConsistent(pass);
    expect(db.t.checkIns[0].status).toBe('CANCELLED');
    expect(db.t.visits).toHaveLength(0);
    expect(db.t.audits).toEqual([
      expect.objectContaining({
        userId: 'staff-2',
        action: 'CHECKIN_REVOKED',
        details: expect.stringContaining('Rossz vendég'),
      }),
    ]);
  });

  it('levonás → levonás-visszavonás → beléptetés-sztornó: csak egyszer ír jóvá, a beléptetés és a látogatás is lezárul', async () => {
    const pass = addPass();
    const res = await deduct(pass.id);

    const reversed = await passes.reversePassUsage(
      res.usageId!,
      { reversalReason: 'Téves kezelés' },
      'staff-1',
      STUDIO,
    );
    expect(reversed.restoredRemainingPasses).toBe(10);
    expect(reversed.checkInId).toBe(res.checkInId);
    expect(db.t.checkIns[0].status).toBe('CANCELLED');
    expect(db.t.visits).toHaveLength(0);

    await expect(
      checkIns.revokeCheckIn(res.checkInId!, 'staff-1', STUDIO),
    ).rejects.toMatchObject({ code: 'CHECKIN.NOT_REVOCABLE' });

    expect(pass.remainingPasses).toBe(10);
    expectLedgerConsistent(pass);
    expect(db.t.audits).toEqual([
      expect.objectContaining({
        userId: 'staff-1',
        action: 'PASS_USAGE_REVERSED',
        details: expect.stringContaining('Téves kezelés'),
      }),
    ]);
  });

  it('vonalkódos (kezelés) beléptetés levonása is a beléptetéshez kötött: visszavonás után a sztornó már nem ír jóvá', async () => {
    const pass = addPass({ passTemplateId: 'tpl-general', serviceId: null, remainingPasses: 3, totalPasses: 3 });
    const res = await checkIns.processBarcodeCheckIn({ barcode: 'RS100001' }, 'staff-1', STUDIO);
    expect(res.remainingPasses).toBe(2);
    const usage = db.t.usages[0];
    expect(usage.checkInId).toBe(res.checkInId);
    expectLedgerConsistent(pass);

    await passes.reversePassUsage(usage.id, { reversalReason: 'Teszt' }, 'staff-1', STUDIO);
    await expect(checkIns.revokeCheckIn(res.checkInId!, 'staff-1', STUDIO)).rejects.toMatchObject({
      code: 'CHECKIN.NOT_REVOCABLE',
    });
    expect(pass.remainingPasses).toBe(3);
    expectLedgerConsistent(pass);
  });

  it('az utolsó alkalom levonása lezárja, a visszavonás újranyitja a bérletet; az invariáns minden lépés után áll', async () => {
    const pass = addPass({ totalPasses: 2, remainingPasses: 2 });
    const first = await deduct(pass.id);
    const second = await deduct(pass.id);
    expect(second.remainingPasses).toBe(0);
    expect(pass.isActive).toBe(false);
    await expect(deduct(pass.id)).rejects.toMatchObject({ code: 'PASS.NO_REMAINING' });
    expectLedgerConsistent(pass);

    await checkIns.revokeCheckIn(second.checkInId!, 'staff-1', STUDIO);
    expect(pass.isActive).toBe(true);
    expectLedgerConsistent(pass);
    await passes.reversePassUsage(first.usageId!, { reversalReason: 'x' }, 'staff-1', STUDIO);
    expect(pass.remainingPasses).toBe(2);
    expectLedgerConsistent(pass);
  });

  it('más szolgáltatás bérletéről nem vonható le kezelés; a szolgáltatáshoz nem kötött bérlet bármely kezelésre jó', async () => {
    const hypoxi = addPass();
    await expect(deduct(hypoxi.id, 'srv-face')).rejects.toMatchObject({
      code: 'PASS.SERVICE_MISMATCH',
    });
    expect(db.t.usages).toHaveLength(0);
    expect(db.t.checkIns).toHaveLength(0);

    const general = addPass({ passTemplateId: 'tpl-general', serviceId: null });
    const res = await deduct(general.id, 'srv-face');
    expect(res.serviceName).toBe('Arckezelés');
  });

  it('még el nem kezdett, lejárt és fagyasztott bérletről nem vonható le alkalom', async () => {
    const future = addPass({ startDate: new Date(Date.now() + 3 * DAY) });
    await expect(deduct(future.id)).rejects.toMatchObject({ code: 'PASS.NOT_STARTED' });

    const expired = addPass({ expirationDate: new Date(Date.now() - 2 * DAY) });
    await expect(deduct(expired.id)).rejects.toMatchObject({ code: 'PASS.EXPIRED' });

    const frozen = addPass({ isFrozen: true });
    await expect(deduct(frozen.id)).rejects.toMatchObject({ code: 'PASS.FROZEN' });

    const cancelled = addPass({ cancelledAt: new Date(), isActive: false });
    await expect(deduct(cancelled.id)).rejects.toMatchObject({ code: 'PASS.EXPIRED' });
    expect(db.t.usages).toHaveLength(0);
  });

  it('időalapú bérlet: a kezelés nyoma (delta −1) megmarad, alkalomszám nincs, visszavonás után „Korlátlan”', async () => {
    const pass = addPass({
      passTemplateId: 'tpl-unlimited',
      serviceId: null,
      type: 'TIME_BASED',
      totalPasses: null,
      remainingPasses: null,
    });
    const res = await deduct(pass.id);
    expect(res.remainingPasses).toBe('Korlátlan');
    expect(pass.remainingPasses).toBeNull();
    const reversed = await passes.reversePassUsage(res.usageId!, { reversalReason: 'x' }, 'staff-1', STUDIO);
    expect(reversed.restoredRemainingPasses).toBe('Korlátlan');
  });

  it('köredzéses beléptetés sztornója: nincs jóváírás, a látogatás törlődik, naplózva', async () => {
    addPass({
      passTemplateId: 'tpl-unlimited',
      serviceId: null,
      type: 'TIME_BASED',
      totalPasses: null,
      remainingPasses: null,
    });
    const res = await checkIns.processBarcodeCheckIn({ barcode: 'RS100001' }, 'staff-1', STUDIO);
    expect(db.t.visits).toHaveLength(1);
    const revoked = await checkIns.revokeCheckIn(res.checkInId!, 'staff-3', STUDIO);
    expect(revoked.restoredRemainingPasses).toBe('Korlátlan');
    expect(db.t.visits).toHaveLength(0);
    expect(db.t.usages).toHaveLength(0);
    expect(db.t.audits[0]).toMatchObject({ userId: 'staff-3', action: 'CHECKIN_REVOKED' });
  });

  it('csak levonás (delta < 0) vonható vissza — a vásárlás sora nem', async () => {
    const pass = addPass();
    db.t.usages.push({ id: 'buy-1', guestPassId: pass.id, delta: 10, reversedAt: null, note: 'Bérlet vásárlás' });
    await expect(
      passes.reversePassUsage('buy-1', { reversalReason: 'x' }, 'staff-1', STUDIO),
    ).rejects.toMatchObject({ code: 'PASS.USAGE_NOT_REVERSIBLE' });
    expectLedgerConsistent(pass);
  });

  it('befizetés sztornója: az eladási befizetés lezárja a bérletet, egy későbbi részlet nem', async () => {
    const pass = addPass();
    db.t.payments.push(
      { id: 'pay-sale', studioId: STUDIO, guestId: 'guest-1', guestPassId: pass.id, recordedByUserId: 'staff-1', amount: 30000, paymentMethod: 'CASH', isCancelled: false, note: null, createdAt: new Date(Date.now() - 2 * DAY) },
      { id: 'pay-part', studioId: STUDIO, guestId: 'guest-1', guestPassId: pass.id, recordedByUserId: 'staff-1', amount: 20000, paymentMethod: 'CASH', isCancelled: false, note: null, createdAt: new Date() },
    );

    await finance.cancelPayment('pay-part', 'Téves részlet', STUDIO, 'staff-1');
    expect(pass.isActive).toBe(true);
    expect(pass.cancelledAt).toBeNull();

    await finance.cancelPayment('pay-sale', 'Téves eladás', STUDIO, 'staff-1');
    expect(pass.isActive).toBe(false);
    expect(pass.cancelledAt).toBeInstanceOf(Date);
    expect(
      getPassStatus({ ...pass, remainingPasses: pass.remainingPasses }),
    ).toBe(PassStatus.CANCELLED);
  });
});

describe('TICKET-16 — getPassStatus / computeRemainingPasses (shared)', () => {
  const base = {
    type: PassType.OCCASION_BASED,
    remainingPasses: 5,
    startDate: '2026-10-01T08:00:00.000Z',
    expirationDate: '2026-11-08T08:00:00.000Z',
    isFrozen: false,
    cancelledAt: null,
  };

  it('a lejárat napján 23:59-kor (Europe/Budapest) még aktív, másnap 00:00-kor lejárt', () => {
    // 2026-11-08 22:59 UTC = 23:59 budapesti idő (CET, UTC+1)
    expect(getPassStatus(base, new Date('2026-11-08T22:59:00.000Z'))).toBe(PassStatus.ACTIVE);
    // 2026-11-08 23:00 UTC = 2026-11-09 00:00 budapesti idő
    expect(getPassStatus(base, new Date('2026-11-08T23:00:00.000Z'))).toBe(PassStatus.EXPIRED);
    expect(toStudioDayKey('2026-11-08T23:00:00.000Z')).toBe('2026-11-09');
  });

  it('állapotok sorrendje: sztornózott > fagyasztott > nem kezdődött > lejárt > elfogyott', () => {
    const now = new Date('2026-10-15T10:00:00.000Z');
    expect(getPassStatus({ ...base, cancelledAt: '2026-10-10T10:00:00.000Z', isFrozen: true }, now)).toBe(PassStatus.CANCELLED);
    expect(getPassStatus({ ...base, isFrozen: true }, now)).toBe(PassStatus.FROZEN);
    expect(getPassStatus({ ...base, startDate: '2026-10-16T08:00:00.000Z' }, now)).toBe(PassStatus.NOT_STARTED);
    expect(getPassStatus({ ...base, remainingPasses: 0 }, now)).toBe(PassStatus.DEPLETED);
    expect(getPassStatus({ ...base, type: PassType.TIME_BASED, remainingPasses: null }, now)).toBe(PassStatus.ACTIVE);
  });

  it('hátralévő = összes − nem visszavont levonások; a vásárlás, hosszabbítás és a régi +1 sor nem számít', () => {
    const logs = [
      { delta: 10 },
      { delta: -1 },
      { delta: -1, reversedAt: '2026-10-02T00:00:00.000Z' },
      { delta: 1 },
      { delta: 0 },
      { delta: -1 },
    ];
    expect(computeRemainingPasses(10, logs)).toBe(8);
    expect(computeRemainingPasses(null, logs)).toBeNull();
    expect(computeRemainingPasses(1, [{ delta: -1 }, { delta: -1 }])).toBe(0);
  });
});
