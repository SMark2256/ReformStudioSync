import { OverdueBucket, PaymentMethod } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceService } from '../finance/finance.service';
import { PassesService } from './passes.service';

describe('PassesService & FinanceService — Kritikus Bérlet, Kezeléslevonás, Tartozás és Kassza Végkimenetelek (9. fejezet)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let monitorGatewayMock: any;
  let passesService: PassesService;
  let financeService: FinanceService;

  beforeEach(() => {
    txMock = {
      guest: {
        findFirst: vi.fn(),
      },
      service: {
        findFirst: vi.fn(),
      },
      passTemplate: {
        findFirst: vi.fn(),
      },
      guestPass: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passUsageLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'usage-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      loggedCheckIn: {
        create: vi.fn().mockResolvedValue({ id: 'chk-treatment-1' }),
      },
      visit: {
        create: vi.fn().mockResolvedValue({ id: 'visit-treatment-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      payment: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentAllocation: {
        create: vi.fn().mockResolvedValue({ id: 'alloc-1' }),
      },
      membershipDue: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
      payment: {
        findMany: vi.fn(),
      },
      membershipDue: {
        findMany: vi.fn(),
      },
    };

    monitorGatewayMock = {
      emitCheckInResult: vi.fn(),
      emitCheckInRevoked: vi.fn(),
    };

    passesService = new PassesService(prismaMock, monitorGatewayMock);
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
        isCancelled: true,
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

  it('4. Alkalmas kezelés levonás (deductTreatmentUsage) és visszavonás (reversePassUsage) indoklással + AuditLog', async () => {
    txMock.guest.findFirst = vi.fn().mockResolvedValue({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: '100001',
      isActive: true,
    });
    txMock.guestPass.findFirst.mockResolvedValue({
      id: 'pass-hypoxi',
      studioId: 'default-studio',
      guestId: 'guest-1',
      passTemplateId: 'tpl-hypoxi',
      type: 'OCCASION_BASED',
      totalPasses: 10,
      remainingPasses: 3, // Levonás után 2 marad -> LOW_OCCASIONS figyelmeztetés!
      expirationDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      isActive: true,
      isFrozen: false,
      guest: { id: 'guest-1', firstName: 'Anna', lastName: 'Kovács', barcode: '100001' },
      passTemplate: { name: '10 Alkalmas Hypoxi Bérlet' },
    });
    txMock.service.findFirst.mockResolvedValue({
      id: 'srv-hypoxi',
      name: 'Hypoxi Kezelés',
    });

    const deductRes = await passesService.deductTreatmentUsage(
      {
        guestId: 'guest-1',
        passId: 'pass-hypoxi',
        serviceId: 'srv-hypoxi',
        operationKey: 'op-key-1',
      },
      'staff-1',
    );

    expect(deductRes.status).toBe('SUCCESS');
    expect(deductRes.mode).toBe('TREATMENT_GREETING');
    expect(deductRes.serviceName).toBe('Hypoxi Kezelés');
    expect(deductRes.remainingPasses).toBe(2);
    expect(deductRes.warnings).toContain('LOW_OCCASIONS');

    // Visszavonás tesztelése
    txMock.passUsageLog.findFirst.mockResolvedValue({
      id: 'usage-1',
      guestPassId: 'pass-hypoxi',
      reversedAt: null,
      service: { name: 'Hypoxi Kezelés' },
      guestPass: {
        id: 'pass-hypoxi',
        studioId: 'default-studio',
        guestId: 'guest-1',
        type: 'OCCASION_BASED',
        remainingPasses: 2,
        guest: { firstName: 'Anna', lastName: 'Kovács' },
      },
    });
    txMock.guestPass.update.mockResolvedValue({
      id: 'pass-hypoxi',
      remainingPasses: 3,
      isActive: true,
    });

    const revRes = await passesService.reversePassUsage(
      'usage-1',
      { reversalReason: 'Téves kezelésválasztás' },
      'staff-1',
    );
    expect(revRes.restoredRemainingPasses).toBe(3);
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('5. Havi tagdíj késési kategóriák (1–5, 6–15, 15+ nap) és részbefizetés allokáció (recordPayment)', async () => {
    const now = Date.now();
    // Az esedékesség-pótlás (ensureDuesUpTo) itt nem talál hiányzó hónapot
    txMock.membership = { findMany: vi.fn().mockResolvedValue([]) };
    prismaMock.membership = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'm1',
          guestId: 'g1',
          status: 'ACTIVE',
          guest: {
            id: 'g1',
            firstName: 'Péter',
            lastName: 'Nagy',
            barcode: '100002',
            phone: '+36301112222',
          },
          dues: [
            {
              id: 'due-3days',
              membershipId: 'm1',
              period: '2026-10',
              dueDate: new Date(now - 3 * 24 * 60 * 60 * 1000),
              amountHuf: 22000,
              paidAmountHuf: 0,
              status: 'PENDING',
            },
          ],
        },
        {
          id: 'm2',
          guestId: 'g2',
          status: 'ACTIVE',
          guest: {
            id: 'g2',
            firstName: 'Zsófia',
            lastName: 'Varga',
            barcode: '100005',
            phone: '+36303334444',
          },
          dues: [
            {
              id: 'due-10days',
              membershipId: 'm2',
              period: '2026-10',
              dueDate: new Date(now - 10 * 24 * 60 * 60 * 1000),
              amountHuf: 22000,
              paidAmountHuf: 10000, // Részbefizetés történt!
              status: 'PARTIAL',
            },
          ],
        },
        {
          id: 'm3',
          guestId: 'g3',
          status: 'ACTIVE',
          guest: {
            id: 'g3',
            firstName: 'Gábor',
            lastName: 'Tóth',
            barcode: '100004',
            phone: '+36305556666',
          },
          dues: [
            {
              id: 'due-20days',
              membershipId: 'm3',
              period: '2026-09',
              dueDate: new Date(now - 20 * 24 * 60 * 60 * 1000),
              amountHuf: 20000,
              paidAmountHuf: 0,
              status: 'PENDING',
            },
          ],
        },
      ]),
    };

    const overdueReport = await financeService.getOverdueMemberships();
    expect(overdueReport.buckets.DAYS_1_5).toHaveLength(1);
    expect(overdueReport.buckets.DAYS_6_15).toHaveLength(1);
    expect(overdueReport.buckets.DAYS_OVER_15).toHaveLength(1);
    expect(overdueReport.totalOverdueHuf).toBe(22000 + 12000 + 20000);
    expect(overdueReport.buckets.DAYS_OVER_15[0].overdueBucket).toBe(
      OverdueBucket.DAYS_OVER_15,
    );
  });
});
