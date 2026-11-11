import {
  ARRIVAL_DENIED_MESSAGES,
  CheckInStatus,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  PassType,
  VisitType,
} from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInsService } from './check-ins.service';

describe('CheckInsService — Kritikus Beléptetési és Köredzés vs. Kezelés Végkimenetelek (9. fejezet)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let monitorGatewayMock: any;
  let service: CheckInsService;

  const futureDate = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const pastDate = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000);

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
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      visit: {
        create: vi.fn().mockResolvedValue({ id: 'visit-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      guest: {
        findUnique: vi.fn(),
      },
      guestPass: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      passUsageLog: {
        create: vi.fn().mockResolvedValue({ id: 'usage-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
    };

    monitorGatewayMock = {
      emitCheckInResult: vi.fn(),
      emitCheckInRevoked: vi.fn(),
    };

    service = new CheckInsService(prismaMock, monitorGatewayMock);
  });

  it('1. Alkalmas bérlet (OCCASION_BASED) beolvasása: nincs belépés, levonás, napló és WebSocket esemény — kezelésválasztás kell (TICKET-39)', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: 'RS100001',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-10',
          passTemplateId: 'tpl-10',
          serviceId: null,
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 7,
          startDate: pastDate(5),
          expirationDate: futureDate(25),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: '10 Alkalmas Reformer Bérlet' },
        },
      ],
    });

    const result = await service.processBarcodeCheckIn(
      { barcode: 'RS100001' },
      'staff-1',
    );

    expect(result.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
    expect(result.guestId).toBe('guest-1');
    expect(result.checkInId).toBeUndefined();
    expect(result.treatmentOptions).toEqual([
      {
        passId: 'pass-10',
        passName: '10 Alkalmas Reformer Bérlet',
        passType: PassType.OCCASION_BASED,
        serviceId: null,
        serviceName: null,
        remainingPasses: 7,
        expirationDate: expect.any(String),
      },
    ]);
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
    expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
    expect(txMock.visit.create).not.toHaveBeenCalled();
    expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
    expect(monitorGatewayMock.emitCheckInResult).not.toHaveBeenCalled();
  });

  it('2. Bérlet-priorizálás: TIME_BASED (korlátlan) bérlettel köredzés belépés, az OCCASION_BASED bérletből nem von le', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: 'RS100001',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-occ',
          passTemplateId: 'tpl-10',
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 5,
          startDate: pastDate(10),
          expirationDate: futureDate(5),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: '10 Alkalmas Bérlet' },
        },
        {
          id: 'pass-time',
          passTemplateId: 'tpl-monthly',
          type: 'TIME_BASED',
          totalPasses: null,
          remainingPasses: null,
          startDate: pastDate(2),
          expirationDate: futureDate(28),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: 'Havi Korlátlan Bérlet' },
        },
      ],
    });

    const result = await service.processBarcodeCheckIn(
      { barcode: 'RS100001' },
      'staff-1',
    );

    expect(result.status).toBe(CheckInStatus.SUCCESS);
    expect(result.mode).toBe('CIRCUIT_GREETING');
    expect(result.passType).toBe(PassType.TIME_BASED);
    expect(result.remainingPasses).toBe('Korlátlan');
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
  });

  it('3. Kezelésválasztás (2 alkalmas bérlet): a választható bérletek a leghamarabb lejáróval kezdődnek', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: 'RS100001',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-later',
          passTemplateId: 'tpl-10',
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 10,
          startDate: pastDate(1),
          expirationDate: futureDate(40),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: 'Újabb 10 Alkalmas' },
        },
        {
          id: 'pass-sooner',
          passTemplateId: 'tpl-5',
          type: 'OCCASION_BASED',
          totalPasses: 5,
          remainingPasses: 2,
          startDate: pastDate(20),
          expirationDate: futureDate(7),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: 'Régebbi 5 Alkalmas' },
        },
      ],
    });

    const result = await service.processBarcodeCheckIn(
      { barcode: 'RS100001' },
      'staff-1',
    );

    expect(result.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
    expect(result.treatmentOptions?.map((o) => o.passId)).toEqual([
      'pass-sooner',
      'pass-later',
    ]);
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
  });

  it('4. Köredzés időalapú bérlettel, hamarosan lejár (<= 3 nap): 0 levonás, EXPIRING_SOON figyelmeztetés', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-2',
      firstName: 'Péter',
      lastName: 'Nagy',
      barcode: 'RS100002',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-month',
          passTemplateId: 'tpl-unlimited',
          serviceId: null,
          type: 'TIME_BASED',
          totalPasses: null,
          remainingPasses: null,
          startDate: pastDate(28),
          expirationDate: futureDate(2),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: 'Havi Korlátlan Bérlet' },
        },
      ],
    });

    const result = await service.processBarcodeCheckIn(
      { barcode: 'RS100002' },
      'staff-1',
    );

    expect(result.status).toBe(CheckInStatus.SUCCESS);
    expect(result.mode).toBe('CIRCUIT_GREETING');
    expect(result.remainingPasses).toBe('Korlátlan');
    expect(result.warnings).toContain('EXPIRING_SOON');
    expect(result.suggestedRenewalTemplateId).toBe('tpl-unlimited');
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
    expect(txMock.loggedCheckIn.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guestPassId: 'pass-month',
        visitType: 'CIRCUIT_TRAINING',
        status: 'SUCCESS',
      }),
    });
  });

  it('5. 10 mp-es Dupla Lehúzás Védelem (DUPLICATE_SCAN): 10 mp-en belül nem léptet be újra; forceDuplicate=true esetén újra dönt (alkalmas bérletnél kezelésválasztás)', async () => {
    expect(DUPLICATE_SCAN_COOLDOWN_SECONDS).toBe(10);

    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: 'RS100001',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-10',
          passTemplateId: 'tpl-10',
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 6,
          startDate: pastDate(5),
          expirationDate: futureDate(25),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: '10 Alkalmas Reformer Bérlet' },
        },
      ],
    });

    // Volt egy sikeres belépés 4 másodperce (10 mp-en belül)
    txMock.loggedCheckIn.findFirst.mockResolvedValue({
      id: 'recent-checkin-1',
      guestId: 'guest-1',
      status: 'SUCCESS',
      createdAt: new Date(Date.now() - 4 * 1000),
      guestPass: {
        type: 'OCCASION_BASED',
        remainingPasses: 6,
        totalPasses: 10,
        expirationDate: futureDate(25),
        passTemplateId: 'tpl-10',
        passTemplate: { name: '10 Alkalmas Reformer Bérlet' },
      },
    });

    const duplicateRes = await service.processBarcodeCheckIn(
      { barcode: 'RS100001' },
      'staff-1',
    );
    expect(duplicateRes.status).toBe(CheckInStatus.DUPLICATE_SCAN);
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();

    // Felülbírálva sem von le: alkalmas bérletnél a beolvasás kezelésválasztást kér (TICKET-39).
    const forcedRes = await service.processBarcodeCheckIn(
      { barcode: 'RS100001', forceDuplicate: true },
      'staff-1',
    );
    expect(forcedRes.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
    expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
  });

  it('6. Elutasítások (DENIED): Fagyasztott bérlet, lejárt bérlet vagy ismeretlen vonalkód esetén nem történik levonás', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-frozen',
      firstName: 'Eszter',
      lastName: 'Tóth',
      barcode: 'RS100004',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-frozen',
          passTemplateId: 'tpl-10',
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 5,
          startDate: pastDate(10),
          expirationDate: futureDate(20),
          isActive: true,
          isFrozen: true,
          passTemplate: { name: '10 Alkalmas Bérlet' },
        },
      ],
    });

    const frozenRes = await service.processBarcodeCheckIn(
      { barcode: 'RS100004' },
      'staff-1',
    );
    expect(frozenRes.status).toBe(CheckInStatus.DENIED);
    expect(frozenRes.reason).toContain('fagyasztva');
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();

    txMock.guest.findUnique.mockResolvedValue(null);
    await expect(
      service.processBarcodeCheckIn({ barcode: 'UNKNOWN999' }, 'staff-1'),
    ).rejects.toMatchObject({ code: 'CHECKIN.GUEST_NOT_FOUND', status: 400 });
  });

  it('7. Hypoxi bérlet + köredzés (VisitType.CIRCUIT_TRAINING): szolgáltatáshoz kötött alkalmas bérlet nem ad ingyenes köredzést, kezelésválasztás kell', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-hypoxi',
      firstName: 'Dóra',
      lastName: 'Horváth',
      barcode: '100006',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-hypoxi',
          passTemplateId: 'tpl-hypoxi',
          serviceId: 'srv-hypoxi',
          service: { id: 'srv-hypoxi', name: 'Hypoxi', category: 'BODY_SHAPING' },
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 8,
          startDate: pastDate(5),
          expirationDate: futureDate(30),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: '10 Alkalmas Hypoxi Bérlet' },
        },
      ],
    });

    const res = await service.processBarcodeCheckIn(
      { barcode: '100006', visitType: VisitType.CIRCUIT_TRAINING },
      'staff-1',
    );

    expect(res.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
    expect(res.treatmentOptions).toEqual([
      expect.objectContaining({
        passId: 'pass-hypoxi',
        serviceId: 'srv-hypoxi',
        serviceName: 'Hypoxi',
        remainingPasses: 8,
      }),
    ]);
    expect(txMock.visit.create).not.toHaveBeenCalled();
    expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
    expect(monitorGatewayMock.emitCheckInResult).not.toHaveBeenCalled();
  });

  it('8. Beléptetés Sztornó (revokeCheckIn) és Offline Idempotencia (idempotencyKey)', async () => {
    txMock.loggedCheckIn.findFirst.mockResolvedValue({
      id: 'checkin-to-revoke',
      studioId: 'default-studio',
      guestId: 'guest-1',
      status: 'SUCCESS',
      visitId: 'visit-1',
      guest: { firstName: 'Anna', lastName: 'Kovács' },
      guestPass: {
        id: 'pass-10',
        type: 'OCCASION_BASED',
        remainingPasses: 0,
        isActive: false,
        cancelledAt: null,
      },
      passUsage: {
        id: 'usage-1',
        delta: -1,
        reversedAt: null,
        guestPass: {
          id: 'pass-10',
          type: 'OCCASION_BASED',
          remainingPasses: 0,
          isActive: false,
          cancelledAt: null,
        },
      },
    });
    txMock.guestPass.update.mockResolvedValue({
      id: 'pass-10',
      remainingPasses: 1,
      isActive: true,
    });

    const revoked = await service.revokeCheckIn(
      'checkin-to-revoke',
      'staff-1',
      'default-studio',
      'Rossz vendég',
    );
    expect(revoked.restoredRemainingPasses).toBe(1);
    expect(txMock.passUsageLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'usage-1', delta: { lt: 0 }, reversedAt: null },
      data: {
        reversedAt: expect.any(Date),
        reversalReason: 'Beléptetés sztornó: Rossz vendég',
      },
    });
    expect(txMock.guestPass.update).toHaveBeenCalledWith({
      where: { id: 'pass-10' },
      data: { remainingPasses: { increment: 1 }, isActive: true },
    });
    expect(txMock.visit.deleteMany).toHaveBeenCalledWith({
      where: { id: 'visit-1' },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'staff-1',
        action: 'CHECKIN_REVOKED',
        entityId: 'checkin-to-revoke',
      }),
    });
    expect(monitorGatewayMock.emitCheckInRevoked).toHaveBeenCalledTimes(1);

    txMock.loggedCheckIn.findUnique.mockResolvedValue({
      id: 'existing-offline-checkin',
      status: 'SUCCESS',
      guestId: 'guest-1',
      createdAt: new Date(),
      guest: { firstName: 'Anna', lastName: 'Kovács', barcode: 'RS100001' },
      guestPass: {
        type: 'OCCASION_BASED',
        remainingPasses: 6,
        totalPasses: 10,
        expirationDate: futureDate(20),
        passTemplateId: 'tpl-10',
        passTemplate: { name: '10 Alkalmas Bérlet' },
      },
    });

    const idempotentRes = await service.processBarcodeCheckIn(
      { barcode: 'RS100001', idempotencyKey: 'offline-key-123' },
      'staff-1',
    );
    expect(idempotentRes.checkInId).toBe('existing-offline-checkin');
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
  });

  it('9. Köredzéses érkezés (VisitType.CIRCUIT_TRAINING): NEM von le bérletalkalmat, ellenőrzi a tagdíj-tartozást a recepciónak, de a vendégmonitorra diszkrét CIRCUIT_GREETING-et küld', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-circuit',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: '100001',
      isActive: true,
      memberships: [
        {
          id: 'memb-1',
          status: 'ACTIVE',
          monthlyFeeHuf: 22000,
          dueDay: 10,
          dues: [
            {
              id: 'due-1',
              status: 'PENDING',
              amountHuf: 22000,
              paidAmountHuf: 0,
              dueDate: pastDate(3),
            },
          ],
        },
      ],
      passes: [
        {
          id: 'pass-hypoxi',
          passTemplateId: 'tpl-hypoxi',
          type: 'OCCASION_BASED',
          totalPasses: 10,
          remainingPasses: 8,
          startDate: pastDate(5),
          expirationDate: futureDate(30),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: '10 Alkalmas Hypoxi Bérlet' },
        },
      ],
    });

    const res = await service.processBarcodeCheckIn(
      { barcode: '100001', visitType: VisitType.CIRCUIT_TRAINING },
      'staff-1',
    );

    expect(res.status).toBe(CheckInStatus.SUCCESS);
    expect(res.mode).toBe('CIRCUIT_GREETING');
    expect(res.overdueAmountHuf).toBe(22000);
    expect(res.warnings).toContain('OVERDUE_DUES');
    // Nem vonhatott le a Hypoxi alkalmas bérletből!
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
    expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
    expect(txMock.visit.create).toHaveBeenCalledTimes(1);
    expect(monitorGatewayMock.emitCheckInResult).toHaveBeenCalledTimes(1);
  });

  it('10. Születésnapos vendég: sikeres belépésnél isBirthday=true (budapesti naptár szerint), más napon false', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Budapesten már november 11. van, UTC szerint még november 10.
    vi.setSystemTime(new Date('2026-11-10T23:30:00.000Z'));
    try {
      const guestWith = (birthDate: Date) => ({
        id: 'guest-1',
        firstName: 'Anna',
        lastName: 'Kovács',
        barcode: 'RS100001',
        birthDate,
        isActive: true,
        memberships: [],
        passes: [
          {
            id: 'pass-month',
            passTemplateId: 'tpl-unlimited',
            serviceId: null,
            type: 'TIME_BASED',
            totalPasses: null,
            remainingPasses: null,
            startDate: pastDate(5),
            expirationDate: futureDate(25),
            isActive: true,
            isFrozen: false,
            passTemplate: { name: 'Havi Korlátlan Bérlet' },
          },
        ],
      });

      txMock.guest.findUnique.mockResolvedValue(
        guestWith(new Date('1991-11-11T00:00:00.000Z')),
      );
      const birthday = await service.processBarcodeCheckIn(
        { barcode: 'RS100001' },
        'staff-1',
      );
      expect(birthday.status).toBe(CheckInStatus.SUCCESS);
      expect(birthday.isBirthday).toBe(true);

      txMock.guest.findUnique.mockResolvedValue(
        guestWith(new Date('1991-11-10T00:00:00.000Z')),
      );
      const regular = await service.processBarcodeCheckIn(
        { barcode: 'RS100001' },
        'staff-1',
      );
      expect(regular.isBirthday).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('TICKET-39 — beolvasás: kezelésválasztás alkalmas bérletnél, nincs ingyenes köredzés', () => {
    const hypoxiPass = (over: Record<string, unknown> = {}) => ({
      id: 'pass-hypoxi',
      passTemplateId: 'tpl-hypoxi',
      serviceId: 'srv-hypoxi',
      service: { id: 'srv-hypoxi', name: 'Hypoxi', category: 'BODY_SHAPING' },
      type: 'OCCASION_BASED',
      totalPasses: 10,
      remainingPasses: 8,
      startDate: pastDate(20),
      expirationDate: futureDate(30),
      isActive: true,
      isFrozen: false,
      frozenAt: null,
      cancelledAt: null,
      passTemplate: { name: '10 Alkalmas Hypoxi Bérlet' },
      ...over,
    });
    const guestWith = (passes: unknown[], memberships: unknown[] = []) => ({
      id: 'guest-dora',
      firstName: 'Dóra',
      lastName: 'Horváth',
      barcode: '100006',
      isActive: true,
      memberships,
      passes,
    });

    it('fagyasztás → feloldás → beolvasás alkalmas bérlettel: előbb elutasítás, utána nincs belépés, kezelésválasztás kell', async () => {
      txMock.guest.findUnique.mockResolvedValue(
        guestWith([hypoxiPass({ isFrozen: true, frozenAt: pastDate(4) })]),
      );
      const frozen = await service.processBarcodeCheckIn(
        { barcode: '100006', visitType: VisitType.CIRCUIT_TRAINING },
        'staff-1',
      );
      expect(frozen.status).toBe(CheckInStatus.DENIED);
      expect(frozen.reason).toContain('fagyasztva');

      txMock.loggedCheckIn.create.mockClear();
      monitorGatewayMock.emitCheckInResult.mockClear();

      // Feloldás után ugyanaz a bérlet: nem fagyasztott, 8 alkalom.
      txMock.guest.findUnique.mockResolvedValue(guestWith([hypoxiPass()]));
      const afterUnfreeze = await service.processBarcodeCheckIn(
        { barcode: '100006', visitType: VisitType.CIRCUIT_TRAINING },
        'staff-1',
      );

      expect(afterUnfreeze.status).toBe(
        CheckInStatus.TREATMENT_SELECTION_REQUIRED,
      );
      expect(afterUnfreeze.guestId).toBe('guest-dora');
      expect(afterUnfreeze.treatmentOptions).toEqual([
        {
          passId: 'pass-hypoxi',
          passName: '10 Alkalmas Hypoxi Bérlet',
          passType: PassType.OCCASION_BASED,
          serviceId: 'srv-hypoxi',
          serviceName: 'Hypoxi',
          remainingPasses: 8,
          expirationDate: expect.any(String),
        },
      ]);
      expect(txMock.visit.create).not.toHaveBeenCalled();
      expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
      expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
      expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
      expect(monitorGatewayMock.emitCheckInResult).not.toHaveBeenCalled();
    });

    it('havi tagság + alkalmas bérlet: köredzés belépés 0 levonással (visitType nélkül is)', async () => {
      txMock.guest.findUnique.mockResolvedValue(
        guestWith(
          [hypoxiPass()],
          [{ id: 'memb-1', status: 'ACTIVE', monthlyFeeHuf: 22000, dues: [] }],
        ),
      );

      const res = await service.processBarcodeCheckIn(
        { barcode: '100006' },
        'staff-1',
      );

      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.mode).toBe('CIRCUIT_GREETING');
      expect(res.remainingPasses).toBe('Korlátlan');
      expect(txMock.loggedCheckIn.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guestPassId: null,
          visitType: 'CIRCUIT_TRAINING',
          status: 'SUCCESS',
        }),
      });
      expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
      expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
      expect(monitorGatewayMock.emitCheckInResult).toHaveBeenCalledTimes(1);
    });

    it('időalapú köredzés bérlet (CIRCUIT szolgáltatás): köredzés belépés a bérletre, 0 levonás', async () => {
      txMock.guest.findUnique.mockResolvedValue(
        guestWith([
          hypoxiPass(),
          {
            id: 'pass-circuit',
            passTemplateId: 'tpl-unlimited',
            serviceId: 'srv-circuit',
            service: {
              id: 'srv-circuit',
              name: 'Női Köredzés',
              category: 'CIRCUIT',
            },
            type: 'TIME_BASED',
            totalPasses: null,
            remainingPasses: null,
            startDate: pastDate(3),
            expirationDate: futureDate(27),
            isActive: true,
            isFrozen: false,
            cancelledAt: null,
            passTemplate: { name: 'Havi Korlátlan Köredzés Bérlet' },
          },
        ]),
      );

      const res = await service.processBarcodeCheckIn(
        { barcode: '100006', visitType: VisitType.CIRCUIT_TRAINING },
        'staff-1',
      );

      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.mode).toBe('CIRCUIT_GREETING');
      expect(res.passName).toBe('Havi Korlátlan Köredzés Bérlet');
      expect(res.passType).toBe(PassType.TIME_BASED);
      expect(txMock.loggedCheckIn.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guestPassId: 'pass-circuit',
          visitType: 'CIRCUIT_TRAINING',
          status: 'SUCCESS',
        }),
      });
      expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
    });

    it('nem köredzés szolgáltatáshoz kötött időalapú bérlet (kozmetika): nem ad köredzést, kezelésválasztás kell', async () => {
      txMock.guest.findUnique.mockResolvedValue(
        guestWith([
          {
            id: 'pass-facial-month',
            passTemplateId: 'tpl-facial-month',
            serviceId: 'srv-facial',
            service: { id: 'srv-facial', name: 'Arckezelés', category: 'COSMETIC' },
            type: 'TIME_BASED',
            totalPasses: null,
            remainingPasses: null,
            startDate: pastDate(3),
            expirationDate: futureDate(27),
            isActive: true,
            isFrozen: false,
            cancelledAt: null,
            passTemplate: { name: 'Havi Prémium Kozmetika' },
          },
        ]),
      );

      const res = await service.processBarcodeCheckIn(
        { barcode: '100006', visitType: VisitType.CIRCUIT_TRAINING },
        'staff-1',
      );

      expect(res.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
      expect(res.treatmentOptions).toEqual([
        expect.objectContaining({
          passId: 'pass-facial-month',
          serviceId: 'srv-facial',
          remainingPasses: 'Korlátlan',
        }),
      ]);
      expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
      expect(monitorGatewayMock.emitCheckInResult).not.toHaveBeenCalled();
    });

    it('offline szinkron: a kezelésválasztást igénylő tétel nem rögzül, de az eredménylistában látszik', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWith([hypoxiPass()]));

      const res = await service.syncOfflineScans(
        {
          items: [
            {
              idempotencyKey: 'offline-1',
              barcode: '100006',
              scannedAt: pastDate(0).toISOString(),
            },
          ],
        },
        'staff-1',
      );

      expect(res.processed).toBe(1);
      expect(res.treatmentSelectionRequired).toBe(1);
      expect(res.results[0]).toMatchObject({
        status: CheckInStatus.TREATMENT_SELECTION_REQUIRED,
        guestName: 'Horváth Dóra',
      });
      expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
      expect(txMock.visit.create).not.toHaveBeenCalled();
      expect(monitorGatewayMock.emitCheckInResult).not.toHaveBeenCalled();
    });
  });

  describe('TICKET-42 — csak nőknek szóló köredzés a beolvasásnál', () => {
    const circuitService = {
      id: 'srv-circuit',
      name: 'Női Köredzés (Havi Tagság)',
      category: 'CIRCUIT',
      womenOnly: true,
    };
    const membership = (over: Record<string, unknown> = {}) => ({
      id: 'mem-1',
      status: 'ACTIVE',
      monthlyFeeHuf: 22000,
      serviceId: 'srv-circuit',
      service: circuitService,
      dues: [],
      ...over,
    });
    const circuitPass = (over: Record<string, unknown> = {}) => ({
      id: 'pass-circuit',
      passTemplateId: 'tpl-unlimited',
      serviceId: 'srv-circuit',
      service: circuitService,
      type: 'TIME_BASED',
      totalPasses: null,
      remainingPasses: null,
      startDate: pastDate(5),
      expirationDate: futureDate(25),
      isActive: true,
      isFrozen: false,
      frozenAt: null,
      cancelledAt: null,
      passTemplate: { name: 'Havi Korlátlan Köredzés Bérlet' },
      ...over,
    });
    const reformerPass = {
      ...circuitPass(),
      id: 'pass-reformer',
      passTemplateId: 'tpl-10',
      serviceId: 'srv-reformer',
      service: {
        id: 'srv-reformer',
        name: 'Reformer Pilates',
        category: 'BODY_SHAPING',
        womenOnly: false,
      },
      type: 'OCCASION_BASED',
      totalPasses: 10,
      remainingPasses: 4,
      passTemplate: { name: '10 Alkalmas Reformer Bérlet' },
    };
    const guestWith = (
      gender: string,
      memberships: unknown[],
      passes: unknown[] = [],
    ) => ({
      id: 'guest-x',
      firstName: gender === 'MALE' ? 'Péter' : 'Anna',
      lastName: 'Teszt',
      barcode: '100099',
      gender,
      isActive: true,
      memberships,
      passes,
    });

    it('női vendég köredzés tagsággal: belép, figyelmeztetés nélkül', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWith('FEMALE', [membership()]));

      const res = await service.processBarcodeCheckIn({ barcode: '100099' }, 'staff-1');

      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.mode).toBe('CIRCUIT_GREETING');
      expect(res.warnings).not.toContain('GENDER_MISSING');
    });

    it('férfi vendég csak nőknek szóló tagsággal: elutasítás WOMEN_ONLY okkal, nincs belépés', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWith('MALE', [membership()]));

      const res = await service.processBarcodeCheckIn({ barcode: '100099' }, 'staff-1');

      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.reason).toBe(ARRIVAL_DENIED_MESSAGES.WOMEN_ONLY);
      expect(txMock.visit.create).not.toHaveBeenCalled();
      expect(txMock.loggedCheckIn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DENIED' }) }),
      );
    });

    it('férfi vendég köredzés bérlettel: elutasítás WOMEN_ONLY okkal', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWith('MALE', [], [circuitPass()]));

      const res = await service.processBarcodeCheckIn({ barcode: '100099' }, 'staff-1');

      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.reason).toBe(ARRIVAL_DENIED_MESSAGES.WOMEN_ONLY);
    });

    it('férfi vendég köredzés tagsággal és Reformer bérlettel: a kezelésválasztó csak a Reformer bérletet kínálja', async () => {
      txMock.guest.findUnique.mockResolvedValue(
        guestWith('MALE', [membership()], [circuitPass(), reformerPass]),
      );

      const res = await service.processBarcodeCheckIn({ barcode: '100099' }, 'staff-1');

      expect(res.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
      expect(res.treatmentOptions?.map((o) => o.passId)).toEqual(['pass-reformer']);
    });

    it('nincs megadva nemnél belép, de a recepció GENDER_MISSING figyelmeztetést kap', async () => {
      txMock.guest.findUnique.mockResolvedValue(guestWith('UNSPECIFIED', [membership()]));

      const res = await service.processBarcodeCheckIn({ barcode: '100099' }, 'staff-1');

      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.warnings).toContain('GENDER_MISSING');
    });
  });
});
