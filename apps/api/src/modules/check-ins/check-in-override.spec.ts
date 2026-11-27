import { CheckInStatus } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassesService } from '../passes/passes.service';
import { CheckInsService } from './check-ins.service';

/** TICKET-15: tartozás miatti elutasítás a beolvasáskor és a levonáskor, kivételes beengedés. */
describe('Beléptetés tartozással és kivételes beengedés (TICKET-15)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let monitorGatewayMock: any;
  let checkIns: CheckInsService;
  let passes: PassesService;

  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
  const daysAhead = (days: number) => new Date(Date.now() + days * DAY);

  /** Aktív havi tagság, `dueDaysAgo` napja lejárt, ki nem fizetett tagdíjjal. */
  const guestWithDues = (dueDaysAgo: number) => ({
    id: 'guest-1',
    firstName: 'Anna',
    lastName: 'Kovács',
    barcode: '100001',
    isActive: true,
    memberships: [
      {
        id: 'memb-1',
        status: 'ACTIVE',
        monthlyFeeHuf: 22000,
        service: null,
        dues: [
          {
            id: 'due-1',
            status: 'PENDING',
            amountHuf: 22000,
            paidAmountHuf: 0,
            dueDate: daysAgo(dueDaysAgo),
          },
        ],
      },
    ],
    passes: [],
  });

  /** Alkalmas Hypoxi bérlet, `boughtDaysAgo` napja vásárolva, részben kifizetve. */
  const hypoxiPass = (boughtDaysAgo: number) => ({
    id: 'pass-1',
    passTemplateId: 'tpl-1',
    serviceId: null,
    service: null,
    type: 'OCCASION_BASED',
    totalPasses: 10,
    remainingPasses: 6,
    startDate: daysAgo(boughtDaysAgo),
    expirationDate: daysAhead(30),
    createdAt: daysAgo(boughtDaysAgo),
    isActive: true,
    isFrozen: false,
    cancelledAt: null,
    priceHuf: 30000,
    debtSince: daysAgo(boughtDaysAgo),
    allocations: [{ amountHuf: 10000, payment: { isCancelled: false } }],
    usageLogs: Array.from({ length: 4 }, () => ({ delta: -1, reversedAt: null })),
    passTemplate: { name: '10 Alkalmas Hypoxi Bérlet', serviceId: null, service: null },
  });

  beforeEach(() => {
    txMock = {
      loggedCheckIn: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: vi.fn().mockImplementation(async ({ data }: { data: any }) => ({
          id: 'checkin-1',
          ...data,
          createdAt: new Date(),
        })),
      },
      visit: { create: vi.fn().mockResolvedValue({ id: 'visit-1' }) },
      guest: { findUnique: vi.fn(), findFirst: vi.fn() },
      guestPass: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      service: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'srv-hypoxi',
          name: 'Hypoxi',
          category: 'BODY_SHAPING',
          womenOnly: false,
        }),
      },
      passUsageLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'usage-1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
    };
    monitorGatewayMock = { emitCheckInResult: vi.fn(), emitCheckInRevoked: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkIns = new CheckInsService(prismaMock as any, monitorGatewayMock);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passes = new PassesService(prismaMock as any, monitorGatewayMock);
  });

  describe('beolvasás', () => {
    it('5 napja lejárt tagdíj: még belép, a recepció látja az összeget', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWithDues(5));
      const res = await checkIns.processBarcodeCheckIn({ barcode: '100001' }, 'staff-1');
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overdueAmountHuf).toBe(22000);
      expect(res.overrideAllowed).toBeUndefined();
    });

    it('6 napja lejárt tagdíj: DENIED, ok és összeg a recepciónak, feloldható; nincs belépés', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWithDues(6));
      const res = await checkIns.processBarcodeCheckIn({ barcode: '100001' }, 'staff-1');

      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.deniedReasonCode).toBe('DUES_OVERDUE');
      expect(res.debtReasons).toEqual(['DUES_OVERDUE']);
      expect(res.overrideAllowed).toBe(true);
      expect(res.overdueAmountHuf).toBe(22000);
      expect(res.overdueDays).toBe(6);
      expect(res.reason).toContain('6 nap késés');
      expect(txMock.visit.create).not.toHaveBeenCalled();
      expect(txMock.loggedCheckIn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DENIED' }) }),
      );
      expect(txMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('bérlet-hátralék a vásárlás után 6 nappal: a kezelésválasztás helyett DENIED (PASS_DEBT)', async () => {
      txMock.guest.findUnique.mockResolvedValue({
        ...guestWithDues(0),
        memberships: [],
        passes: [hypoxiPass(6)],
      });
      const res = await checkIns.processBarcodeCheckIn({ barcode: '100001' }, 'staff-1');
      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.deniedReasonCode).toBe('PASS_DEBT');
      expect(res.passDebtHuf).toBe(20000);
      expect(res.passDebtDays).toBe(6);
      expect(res.overrideAllowed).toBe(true);
    });

    it('ismeretlen hátralék (nincs eladáskori ár) a türelmi idő után: DENIED PASS_DEBT_UNKNOWN', async () => {
      txMock.guest.findUnique.mockResolvedValue({
        ...guestWithDues(0),
        memberships: [],
        passes: [{ ...hypoxiPass(10), priceHuf: null }],
      });
      const res = await checkIns.processBarcodeCheckIn({ barcode: '100001' }, 'staff-1');
      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.deniedReasonCode).toBe('PASS_DEBT_UNKNOWN');
      expect(res.passDebtUnknown).toBe(true);
      expect(res.overrideAllowed).toBe(true);
    });

    it('lejárt bérlet ismeretlen hátraléka nem tilt: a tagsággal belép', async () => {
      txMock.guest.findUnique.mockResolvedValue({
        ...guestWithDues(0),
        passes: [{ ...hypoxiPass(40), priceHuf: null, expirationDate: daysAgo(2) }],
      });
      const res = await checkIns.processBarcodeCheckIn({ barcode: '100001' }, 'staff-1');
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.deniedReasonCode).toBeUndefined();
      expect(res.overrideAllowed).toBeUndefined();
    });

    it('kivételes beengedés indoklás nélkül: 400 CHECKIN.OVERRIDE_REASON_REQUIRED, semmi nem rögzül', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWithDues(6));
      await expect(
        checkIns.processBarcodeCheckIn(
          { barcode: '100001', forceOverride: true, overrideReason: '   ' },
          'staff-1',
        ),
      ).rejects.toMatchObject({ code: 'CHECKIN.OVERRIDE_REASON_REQUIRED', status: 400 });
      expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
      expect(txMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('kivételes beengedés indoklással: belép, a napló és a CHECKIN_OVERRIDE audit rögzül', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWithDues(6));
      const res = await checkIns.processBarcodeCheckIn(
        {
          barcode: '100001',
          forceOverride: true,
          overrideReason: ' Ma átutalta ',
          idempotencyKey: 'override-1',
        },
        'staff-1',
      );

      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overridden).toBe(true);
      expect(txMock.visit.create).toHaveBeenCalledTimes(1);
      expect(txMock.loggedCheckIn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUCCESS',
            reason: 'Kivételes beengedés: Ma átutalta',
            idempotencyKey: 'override-1',
          }),
        }),
      );
      expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
      const audit = txMock.auditLog.create.mock.calls[0][0].data;
      expect(audit).toMatchObject({
        userId: 'staff-1',
        action: 'CHECKIN_OVERRIDE',
        entityType: 'LoggedCheckIn',
        entityId: 'checkin-1',
      });
      expect(audit.details).toContain('Kovács Anna');
      expect(audit.details).toContain('guest-1');
      expect(audit.details).toContain('DUES_OVERDUE');
      expect(audit.details).toContain('Indoklás: Ma átutalta');
      expect(monitorGatewayMock.emitCheckInResult).toHaveBeenCalledTimes(1);
    });

    it('dupla kattintás (ugyanaz az idempotencyKey): nincs második belépés és audit', async () => {
      txMock.loggedCheckIn.findUnique.mockResolvedValue({
        id: 'checkin-1',
        guestId: 'guest-1',
        status: 'SUCCESS',
        visitType: 'CIRCUIT_TRAINING',
        reason: 'Kivételes beengedés: Ma átutalta',
        createdAt: new Date(),
        guest: { ...guestWithDues(6), memberships: [] },
        guestPass: null,
        passUsage: null,
      });
      const res = await checkIns.processBarcodeCheckIn(
        {
          barcode: '100001',
          forceOverride: true,
          overrideReason: 'Ma átutalta',
          idempotencyKey: 'override-1',
        },
        'staff-1',
      );
      expect(res.checkInId).toBe('checkin-1');
      expect(txMock.visit.create).not.toHaveBeenCalled();
      expect(txMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('tartozás nélkül az override nem ír auditot', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWithDues(2));
      const res = await checkIns.processBarcodeCheckIn(
        { barcode: '100001', forceOverride: true, overrideReason: 'Biztos, ami biztos' },
        'staff-1',
      );
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overridden).toBeUndefined();
      expect(txMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('kezelésre szóló bérlet + kivételes beengedés: kezelésválasztás, az audit a levonáskor íródik', async () => {
      txMock.guest.findUnique.mockResolvedValue({
        ...guestWithDues(0),
        memberships: [],
        passes: [hypoxiPass(8)],
      });
      const res = await checkIns.processBarcodeCheckIn(
        { barcode: '100001', forceOverride: true, overrideReason: 'Holnap fizet' },
        'staff-1',
      );
      expect(res.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
      expect(res.overridden).toBe(true);
      expect(txMock.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('kezelés levonása', () => {
    const deduct = (over: Record<string, unknown> = {}) =>
      passes.deductTreatmentUsage(
        { guestId: 'guest-1', passId: 'pass-1', serviceId: 'srv-hypoxi', ...over },
        'staff-1',
      );

    beforeEach(() => {
      txMock.guest.findFirst.mockResolvedValue({
        ...guestWithDues(0),
        memberships: [],
        passes: [hypoxiPass(8)],
      });
      txMock.guestPass.findFirst.mockResolvedValue(hypoxiPass(8));
    });

    it('türelmi időn túli hátralék: 409 CHECKIN.DEBT_BLOCKED, nincs levonás', async () => {
      await expect(deduct()).rejects.toMatchObject({
        code: 'CHECKIN.DEBT_BLOCKED',
        status: 409,
      });
      expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
      expect(txMock.visit.create).not.toHaveBeenCalled();
    });

    it('kivételes beengedés indoklás nélkül: 400', async () => {
      await expect(deduct({ forceOverride: true })).rejects.toMatchObject({
        code: 'CHECKIN.OVERRIDE_REASON_REQUIRED',
      });
      expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
    });

    it('kivételes beengedés indoklással: levonás és CHECKIN_OVERRIDE audit', async () => {
      const res = await deduct({
        forceOverride: true,
        overrideReason: 'Holnap fizet',
        operationKey: 'op-1',
      });
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overridden).toBe(true);
      expect(txMock.passUsageLog.create).toHaveBeenCalledTimes(1);
      const audit = txMock.auditLog.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => c[0].data.action === 'CHECKIN_OVERRIDE',
      )?.[0].data;
      expect(audit).toMatchObject({ userId: 'staff-1', entityType: 'LoggedCheckIn' });
      expect(audit.details).toContain('PASS_DEBT');
      expect(audit.details).toContain('Indoklás: Holnap fizet');
    });

    it('a türelmi időn belül nincs tiltás', async () => {
      txMock.guest.findFirst.mockResolvedValue({
        ...guestWithDues(0),
        memberships: [],
        passes: [hypoxiPass(5)],
      });
      txMock.guestPass.findFirst.mockResolvedValue(hypoxiPass(5));
      const res = await deduct();
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overridden).toBeUndefined();
    });
  });
});
