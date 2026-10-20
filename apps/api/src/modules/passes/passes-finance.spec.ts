import { PaymentMethod } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceService } from '../finance/finance.service';
import { PassesService } from './passes.service';

describe('PassesService & FinanceService — Kritikus Bérlet és Kassza Végkimenetelek', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let passesService: PassesService;
  let financeService: FinanceService;

  beforeEach(() => {
    txMock = {
      guest: {
        findFirst: vi.fn(),
      },
      passTemplate: {
        findFirst: vi.fn(),
      },
      guestPass: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      passUsageLog: {
        create: vi.fn(),
      },
      payment: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
      payment: {
        findMany: vi.fn(),
      },
    };

    passesService = new PassesService(prismaMock);
    financeService = new FinanceService(prismaMock);
  });

  it('1. Atomi Bérleteladás (sellPass): egyszerre hozza létre az aktív GuestPass rekordot és a Payment kasszatételt', async () => {
    txMock.guest.findFirst.mockResolvedValue({
      id: 'guest-1',
      studioId: 'default-studio',
    });
    txMock.passTemplate.findFirst.mockResolvedValue({
      id: 'tpl-10',
      studioId: 'default-studio',
      name: '10 Alkalmas Reformer Bérlet',
      type: 'OCCASION_BASED',
      totalPasses: 10,
      durationDays: 60,
      price: 52000,
      isActive: true,
    });
    txMock.guestPass.create.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ data }: { data: any }) => ({
        id: 'new-pass-1',
        ...data,
        createdAt: new Date(),
        passTemplate: { name: '10 Alkalmas Reformer Bérlet' },
      }),
    );
    txMock.payment.create.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ data }: { data: any }) => ({
        id: 'payment-1',
        ...data,
      }),
    );

    const res = await passesService.sellPass(
      {
        guestId: 'guest-1',
        passTemplateId: 'tpl-10',
        paymentMethod: PaymentMethod.POS_CARD,
      },
      'staff-1',
    );

    expect(res.paymentId).toBe('payment-1');
    expect(res.amount).toBe(52000);
    expect(res.pass.totalPasses).toBe(10);
    expect(res.pass.remainingPasses).toBe(10);
    expect(res.pass.isActive).toBe(true);
    expect(txMock.payment.create).toHaveBeenCalledTimes(1);
  });

  it('2. Bérlet Fagyasztás és Feloldás (toggleFreezePass): feloldáskor pontosan hozzáadja a szüneteltetett napokat a lejárati dátumhoz', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const originalExpiration = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    txMock.guestPass.findFirst.mockResolvedValue({
      id: 'pass-1',
      studioId: 'default-studio',
      guestId: 'guest-1',
      passTemplateId: 'tpl-10',
      type: 'OCCASION_BASED',
      totalPasses: 10,
      remainingPasses: 6,
      startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      expirationDate: originalExpiration,
      isActive: true,
      isFrozen: true,
      frozenAt: fiveDaysAgo,
      createdAt: new Date(),
      passTemplate: { name: '10 Alkalmas Bérlet' },
    });

    txMock.guestPass.update.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ data }: { data: any }) => ({
        id: 'pass-1',
        studioId: 'default-studio',
        guestId: 'guest-1',
        passTemplateId: 'tpl-10',
        type: 'OCCASION_BASED',
        totalPasses: 10,
        remainingPasses: 6,
        startDate: new Date(),
        expirationDate: data.expirationDate,
        isActive: true,
        isFrozen: data.isFrozen,
        frozenAt: data.frozenAt,
        createdAt: new Date(),
        passTemplate: { name: '10 Alkalmas Bérlet' },
      }),
    );

    const unfreezeRes = await passesService.toggleFreezePass('pass-1', {});

    expect(unfreezeRes.isFrozen).toBe(false);
    const addedDays = Math.round(
      (new Date(unfreezeRes.expirationDate).getTime() -
        originalExpiration.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    expect(addedDays).toBeGreaterThanOrEqual(5);
  });

  it('3. Napi Kasszazárás és Fizetés Sztornó (cancelPayment): a sztornózott fizetés inaktiválja a bérletet és nem számít bele a napi bevételbe', async () => {
    // 3/A: Sztornózás inaktiválja a bérletet
    txMock.payment.findFirst.mockResolvedValue({
      id: 'pay-to-cancel',
      studioId: 'default-studio',
      guestId: 'guest-1',
      guestPassId: 'pass-to-deactivate',
      recordedByUserId: 'staff-1',
      amount: 28000,
      paymentMethod: 'CASH',
      isCancelled: false,
      note: '5 Alkalmas értékesítés',
      createdAt: new Date(),
      guest: { firstName: 'Péter', lastName: 'Nagy' },
      guestPass: { passTemplate: { name: '5 Alkalmas Bérlet' } },
      recordedBy: { name: 'Recepció' },
    });

    txMock.payment.update.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ data }: { data: any }) => ({
        id: 'pay-to-cancel',
        studioId: 'default-studio',
        guestId: 'guest-1',
        guestPassId: 'pass-to-deactivate',
        recordedByUserId: 'staff-1',
        amount: 28000,
        paymentMethod: 'CASH',
        isCancelled: data.isCancelled,
        note: data.note,
        createdAt: new Date(),
        guest: { firstName: 'Péter', lastName: 'Nagy' },
        guestPass: { passTemplate: { name: '5 Alkalmas Bérlet' } },
        recordedBy: { name: 'Recepció' },
      }),
    );

    const cancelled = await financeService.cancelPayment(
      'pay-to-cancel',
      'Téves rögzítés',
    );
    expect(cancelled.isCancelled).toBe(true);
    expect(txMock.guestPass.update).toHaveBeenCalledWith({
      where: { id: 'pass-to-deactivate' },
      data: { isActive: false },
    });

    // 3/B: Napi kassza összesítés csak a nem sztornózott tételeket számolja
    prismaMock.payment.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        studioId: 'default-studio',
        guestId: 'guest-1',
        guestPassId: 'pass-1',
        recordedByUserId: 'staff-1',
        amount: 52000,
        paymentMethod: 'POS_CARD',
        isCancelled: false,
        note: null,
        createdAt: new Date(),
        guest: { firstName: 'Anna', lastName: 'Kovács' },
        guestPass: { passTemplate: { name: '10 Alkalmas' } },
        recordedBy: { name: 'Recepció' },
      },
      {
        id: 'pay-2-cancelled',
        studioId: 'default-studio',
        guestId: 'guest-2',
        guestPassId: 'pass-2',
        recordedByUserId: 'staff-1',
        amount: 28000,
        paymentMethod: 'CASH',
        isCancelled: true, // Sztornózott!
        note: 'Sztornózva',
        createdAt: new Date(),
        guest: { firstName: 'Péter', lastName: 'Nagy' },
        guestPass: { passTemplate: { name: '5 Alkalmas' } },
        recordedBy: { name: 'Recepció' },
      },
    ]);

    const summary = await financeService.getDailySummary();
    expect(summary.totalRevenue).toBe(52000);
    expect(summary.byMethod.POS_CARD).toBe(52000);
    expect(summary.byMethod.CASH).toBe(0);
    expect(summary.activeTransactionCount).toBe(1);
    expect(summary.cancelledTransactionCount).toBe(1);
  });
});
