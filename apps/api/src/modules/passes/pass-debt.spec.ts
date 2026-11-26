/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computePassDebt,
  nextPassDebtSince,
  PaymentMethod,
  summarizePassDebts,
} from '@reform/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceService } from '../finance/finance.service';
import { passDebtFields } from './pass-debt';
import { PassesService } from './passes.service';

/**
 * TICKET-14: bérlet-hátralék részletfizetésnél. Kis memóriabeli Prisma-utánzat az eladás, a
 * bérlethez rendelt befizetés és a sztornó lekérdezés-alakjaival, így a hátralék és a
 * keletkezési időpont valódi állapoton ellenőrizhető.
 */

const STUDIO = 'default-studio';
const DAY = 24 * 60 * 60 * 1000;

function createDb() {
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;
  const t = {
    guests: [
      { id: 'guest-1', studioId: STUDIO, firstName: 'Anna', lastName: 'Kovács', gender: 'FEMALE' },
      { id: 'guest-2', studioId: STUDIO, firstName: 'Éva', lastName: 'Kiss', gender: 'FEMALE' },
    ] as any[],
    templates: [
      {
        id: 'tpl-10',
        studioId: STUDIO,
        name: '10 Alkalmas Hypoxi',
        type: 'OCCASION_BASED',
        totalPasses: 10,
        durationDays: 60,
        price: 60000,
        isActive: true,
        serviceId: null,
        service: null,
      },
    ] as any[],
    passes: [] as any[],
    payments: [] as any[],
    allocations: [] as any[],
    usages: [] as any[],
  };

  const allocationsOf = (passId: string) =>
    t.allocations
      .filter((a) => a.passId === passId)
      .map((a) => ({
        amountHuf: a.amountHuf,
        payment: { isCancelled: t.payments.find((p) => p.id === a.paymentId)!.isCancelled },
      }));
  const paymentView = (p: any) => ({
    ...p,
    guest: t.guests.find((g) => g.id === p.guestId),
    guestPass: null,
    recordedBy: { name: 'Recepció' },
    allocations: t.allocations.filter((a) => a.paymentId === p.id),
  });

  const tx: any = {
    guest: {
      findFirst: async ({ where }: any) =>
        t.guests.find((g) => g.id === where.id && g.studioId === where.studioId) ?? null,
    },
    passTemplate: {
      findFirst: async ({ where }: any) =>
        t.templates.find((x) => x.id === where.id && x.isActive) ?? null,
    },
    guestPass: {
      create: async ({ data }: any) => {
        const row = { id: id('pass'), createdAt: new Date(), cancelledAt: null, frozenAt: null, ...data };
        t.passes.push(row);
        return { ...row, passTemplate: t.templates.find((x) => x.id === row.passTemplateId), service: null };
      },
      findFirst: async ({ where }: any) =>
        t.passes.find(
          (p) => p.id === where.id && p.guestId === where.guestId && p.studioId === where.studioId,
        ) ?? null,
      findUnique: async ({ where }: any) => {
        const p = t.passes.find((x) => x.id === where.id);
        return p ? { ...p, allocations: allocationsOf(p.id) } : null;
      },
      update: async ({ where, data }: any) => {
        const row = t.passes.find((x) => x.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
    },
    passUsageLog: {
      create: async ({ data }: any) => {
        t.usages.push({ id: id('usage'), ...data });
        return t.usages[t.usages.length - 1];
      },
    },
    payment: {
      create: async ({ data }: any) => {
        const row = { id: id('pay'), createdAt: new Date(Date.now() + seq), isCancelled: false, ...data };
        t.payments.push(row);
        return paymentView(row);
      },
      findFirst: async ({ where, orderBy }: any) => {
        const rows = t.payments.filter((p) =>
          where.id ? p.id === where.id : p.guestPassId === where.guestPassId,
        );
        if (orderBy) rows.sort((a, b) => a.createdAt - b.createdAt);
        return rows[0] ? paymentView(rows[0]) : null;
      },
      update: async ({ where, data }: any) => {
        const row = t.payments.find((x) => x.id === where.id);
        Object.assign(row, data);
        return paymentView(row);
      },
    },
    paymentAllocation: {
      create: async ({ data }: any) => {
        const row = { id: id('alloc'), membershipDueId: null, ...data };
        t.allocations.push(row);
        return row;
      },
    },
    auditLog: { create: async () => ({}) },
  };

  const prisma: any = { $transaction: async (cb: any) => cb(tx) };
  return { t, prisma, tx };
}

describe('TICKET-14 — Bérlet-hátralék részletfizetésnél (API)', () => {
  let db: ReturnType<typeof createDb>;
  let passes: PassesService;
  let finance: FinanceService;

  const sell = (paidAmount?: number) =>
    passes.sellPass(
      { guestId: 'guest-1', passTemplateId: 'tpl-10', paymentMethod: PaymentMethod.CASH, paidAmount },
      'staff-1',
      STUDIO,
    );
  const pay = (passId: string, amountHuf: number) =>
    finance.recordPayment(
      { guestId: 'guest-1', amountHuf, paymentMethod: PaymentMethod.CASH, passId },
      'staff-1',
      STUDIO,
    );
  /** A bérlet hátralék-mezői a tárolt állapotból, ahogy az adatlap kapja. */
  const debtOf = async (passId: string) =>
    passDebtFields(await db.tx.guestPass.findUnique({ where: { id: passId } }));

  beforeEach(() => {
    db = createDb();
    passes = new PassesService(db.prisma);
    finance = new FinanceService(db.prisma);
  });

  it('teljes áras eladás (paidAmount nélkül): nincs hátralék, a régi kliens viselkedése változatlan', async () => {
    const res = await sell();
    expect(res.amount).toBe(60000);
    expect(res.pass).toMatchObject({ priceHuf: 60000, paidHuf: 60000, debtHuf: 0, debtStatus: 'NONE', debtSince: null });
    expect(db.t.passes[0].debtSince).toBeNull();
  });

  it('részfizetéssel eladott bérlet: a hátralék és a keletkezés időpontja rögzül', async () => {
    const res = await sell(20000);
    expect(res.amount).toBe(20000);
    expect(res.pass).toMatchObject({ priceHuf: 60000, paidHuf: 20000, debtHuf: 40000, debtStatus: 'OUTSTANDING' });
    expect(db.t.passes[0].debtSince).toBeInstanceOf(Date);
    expect(res.pass.debtSince).toBe(db.t.passes[0].debtSince.toISOString());
    expect(db.t.allocations).toHaveLength(1);
  });

  it('a bérlet áránál nagyobb most fizetett összeg nem adható el', async () => {
    await expect(sell(60001)).rejects.toMatchObject({ code: 'PASS.PAID_EXCEEDS_PRICE' });
    expect(db.t.passes).toHaveLength(0);
  });

  it('részlet csökkenti, a teljes rendezés megszünteti; a keletkezés a részfizetéskor nem indul újra', async () => {
    const { pass } = await sell(20000);
    const since = db.t.passes[0].debtSince;

    await pay(pass.id, 15000);
    expect(await debtOf(pass.id)).toMatchObject({ debtHuf: 25000, debtStatus: 'OUTSTANDING' });
    expect(db.t.passes[0].debtSince).toBe(since);

    await pay(pass.id, 25000);
    expect(await debtOf(pass.id)).toMatchObject({ debtHuf: 0, debtStatus: 'NONE', debtSince: null });
    expect(db.t.passes[0].debtSince).toBeNull();
  });

  it('részlet sztornója visszaállítja a hátralékot, új keletkezési időponttal', async () => {
    const { pass } = await sell(20000);
    const installment = await pay(pass.id, 40000);
    expect(db.t.passes[0].debtSince).toBeNull();

    await finance.cancelPayment(installment.id, 'Téves részlet', STUDIO, 'staff-1');
    expect(await debtOf(pass.id)).toMatchObject({ debtHuf: 40000, debtStatus: 'OUTSTANDING' });
    expect(db.t.passes[0].debtSince).toBeInstanceOf(Date);
    expect(db.t.passes[0].cancelledAt).toBeNull();
  });

  it('az eladás sztornója megszünteti a hátralékot (a bérlet sem használható)', async () => {
    const { pass, paymentId } = await sell(20000);
    await finance.cancelPayment(paymentId, 'Téves eladás', STUDIO, 'staff-1');
    expect(db.t.passes[0].cancelledAt).toBeInstanceOf(Date);
    expect(await debtOf(pass.id)).toMatchObject({ debtHuf: 0, debtStatus: 'NONE' });
    expect(db.t.passes[0].debtSince).toBeNull();
  });

  it('más vendég bérletéhez nem rögzíthető befizetés', async () => {
    const { pass } = await sell(20000);
    await expect(
      finance.recordPayment(
        { guestId: 'guest-2', amountHuf: 1000, paymentMethod: PaymentMethod.CASH, passId: pass.id },
        'staff-1',
        STUDIO,
      ),
    ).rejects.toMatchObject({ code: 'PASS.NOT_FOUND' });
    expect((await debtOf(pass.id)).debtHuf).toBe(40000);
  });
});

describe('TICKET-14 — computePassDebt / nextPassDebtSince / summarizePassDebts (shared)', () => {
  const now = new Date('2026-11-26T10:00:00.000Z');

  it('hátralék = ár − nem sztornózott befizetések; túlfizetésnél 0', () => {
    expect(
      computePassDebt({ priceHuf: 50000 }, [
        { amountHuf: 20000, isCancelled: false },
        { amountHuf: 10000, isCancelled: true },
      ]),
    ).toEqual({ status: 'OUTSTANDING', priceHuf: 50000, paidHuf: 20000, debtHuf: 30000 });
    expect(computePassDebt({ priceHuf: 50000 }, [{ amountHuf: 60000, isCancelled: false }])).toMatchObject({
      status: 'NONE',
      debtHuf: 0,
    });
  });

  it('fail-closed: ismeretlen ár vagy be nem töltött befizetések → UNKNOWN, nem 0', () => {
    expect(computePassDebt({ priceHuf: null }, [])).toMatchObject({ status: 'UNKNOWN', debtHuf: null });
    expect(computePassDebt({}, [])).toMatchObject({ status: 'UNKNOWN', debtHuf: null });
    expect(computePassDebt({ priceHuf: 50000 }, undefined)).toMatchObject({ status: 'UNKNOWN', debtHuf: null });
  });

  it('sztornózott eladásnál nincs hátralék', () => {
    expect(computePassDebt({ priceHuf: 50000, cancelledAt: now }, [])).toMatchObject({ status: 'NONE', debtHuf: 0 });
  });

  it('keletkezés: megmarad részfizetéskor, törlődik kiegyenlítéskor, újra keletkezik sztornókor', () => {
    const earlier = new Date(now.getTime() - 3 * DAY);
    const outstanding = computePassDebt({ priceHuf: 100 }, [{ amountHuf: 50, isCancelled: false }]);
    const settled = computePassDebt({ priceHuf: 100 }, [{ amountHuf: 100, isCancelled: false }]);
    const unknown = computePassDebt({ priceHuf: null }, []);
    expect(nextPassDebtSince(earlier, outstanding, now)).toBe(earlier);
    expect(nextPassDebtSince(null, outstanding, now)).toBe(now);
    expect(nextPassDebtSince(earlier, settled, now)).toBeNull();
    expect(nextPassDebtSince(earlier, unknown, now)).toBe(earlier);
  });

  it('vendég-összesítés: az ismert hátralékok összege, a legkorábbi keletkezés és az ismeretlen jelzése', () => {
    const outstanding = (debtHuf: number) =>
      computePassDebt({ priceHuf: debtHuf }, [{ amountHuf: 0, isCancelled: false }]);
    expect(
      summarizePassDebts([
        { debt: outstanding(10000), debtSince: '2026-11-20T08:00:00.000Z' },
        { debt: outstanding(5000), debtSince: '2026-11-18T08:00:00.000Z' },
        { debt: computePassDebt({ priceHuf: 100 }, [{ amountHuf: 100, isCancelled: false }]) },
      ]),
    ).toEqual({ debtHuf: 15000, hasUnknown: false, since: '2026-11-18T08:00:00.000Z' });
    expect(summarizePassDebts([{ debt: computePassDebt({ priceHuf: null }, []) }])).toEqual({
      debtHuf: 0,
      hasUnknown: true,
      since: null,
    });
  });
});
