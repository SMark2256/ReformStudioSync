import { BadRequestException, ConflictException } from '@nestjs/common';
import {
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
      },
      visit: {
        create: vi.fn().mockResolvedValue({ id: 'visit-1' }),
      },
      guest: {
        findUnique: vi.fn(),
      },
      guestPass: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      passUsageLog: {
        create: vi.fn().mockResolvedValue({}),
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

  it('1. Sikeres beléptetés (SUCCESS): OCCASION_BASED bérletből pontosan 1 alkalmat von le és commit után küld WebSocket eseményt', async () => {
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

    expect(result.status).toBe(CheckInStatus.SUCCESS);
    expect(result.remainingPasses).toBe(6);
    expect(result.warnings).toEqual([]);
    expect(txMock.guestPass.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pass-10',
        isActive: true,
        isFrozen: false,
        remainingPasses: { gt: 0 },
      },
      data: { remainingPasses: { decrement: 1 } },
    });
    expect(monitorGatewayMock.emitCheckInResult).toHaveBeenCalledTimes(1);
  });

  it('2. Bérlet-priorizálás: TIME_BASED (korlátlan) bérletet részesíti előnyben az OCCASION_BASED bérlettel szemben', async () => {
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
    expect(result.passType).toBe(PassType.TIME_BASED);
    expect(result.remainingPasses).toBe('Korlátlan');
    expect(txMock.guestPass.updateMany).not.toHaveBeenCalled();
  });

  it('3. Bérlet-priorizálás (2 alkalmas bérlet): mindig a leghamarabb lejáró OCCASION_BASED bérletből von le', async () => {
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

    expect(result.status).toBe(CheckInStatus.SUCCESS);
    expect(result.passName).toBe('Régebbi 5 Alkalmas');
    expect(txMock.guestPass.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'pass-sooner' }),
      }),
    );
  });

  it('4. Utolsó alkalom (1 -> 0) és Hamarosan lejár (<= 3 nap): LAST_OCCASION + EXPIRING_SOON figyelmeztetés és bérlet inaktiválás', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-2',
      firstName: 'Péter',
      lastName: 'Nagy',
      barcode: 'RS100002',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-last',
          passTemplateId: 'tpl-5',
          type: 'OCCASION_BASED',
          totalPasses: 5,
          remainingPasses: 1,
          startDate: pastDate(28),
          expirationDate: futureDate(2),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: '5 Alkalmas Reformer Bérlet' },
        },
      ],
    });

    const result = await service.processBarcodeCheckIn(
      { barcode: 'RS100002' },
      'staff-1',
    );

    expect(result.status).toBe(CheckInStatus.SUCCESS);
    expect(result.remainingPasses).toBe(0);
    expect(result.warnings).toContain('LAST_OCCASION');
    expect(result.warnings).toContain('EXPIRING_SOON');
    expect(result.suggestedRenewalTemplateId).toBe('tpl-5');
    expect(txMock.guestPass.update).toHaveBeenCalledWith({
      where: { id: 'pass-last' },
      data: { isActive: false },
    });
  });

  it('5. 10 mp-es Dupla Lehúzás Védelem (DUPLICATE_SCAN): 10 mp-en belül nem von le újabb alkalmat, kivéve forceDuplicate=true esetén', async () => {
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

    const forcedRes = await service.processBarcodeCheckIn(
      { barcode: 'RS100001', forceDuplicate: true },
      'staff-1',
    );
    expect(forcedRes.status).toBe(CheckInStatus.SUCCESS);
    expect(forcedRes.remainingPasses).toBe(5);
    expect(txMock.guestPass.updateMany).toHaveBeenCalledTimes(1);
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
    ).rejects.toThrow(BadRequestException);
  });

  it('7. Versenyhelyzet (Race Condition) védelem: ha az atomi updateMany count=0 értéket ad vissza, ConflictException-t dob és nem megy negatívba', async () => {
    txMock.guest.findUnique.mockResolvedValue({
      id: 'guest-1',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: 'RS100001',
      isActive: true,
      memberships: [],
      passes: [
        {
          id: 'pass-race',
          passTemplateId: 'tpl-1',
          type: 'OCCASION_BASED',
          totalPasses: 1,
          remainingPasses: 1,
          startDate: pastDate(1),
          expirationDate: futureDate(5),
          isActive: true,
          isFrozen: false,
          passTemplate: { name: 'Napijegy' },
        },
      ],
    });

    txMock.guestPass.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.processBarcodeCheckIn({ barcode: 'RS100001' }, 'staff-1'),
    ).rejects.toThrow(ConflictException);
    expect(monitorGatewayMock.emitCheckInResult).not.toHaveBeenCalled();
  });

  it('8. Beléptetés Sztornó (revokeCheckIn) és Offline Idempotencia (idempotencyKey)', async () => {
    txMock.loggedCheckIn.findFirst.mockResolvedValue({
      id: 'checkin-to-revoke',
      studioId: 'default-studio',
      guestId: 'guest-1',
      status: 'SUCCESS',
      guest: { firstName: 'Anna', lastName: 'Kovács' },
      guestPass: {
        id: 'pass-10',
        type: 'OCCASION_BASED',
        remainingPasses: 0,
      },
    });
    txMock.guestPass.update.mockResolvedValue({
      id: 'pass-10',
      remainingPasses: 1,
      isActive: true,
    });

    const revoked = await service.revokeCheckIn('checkin-to-revoke');
    expect(revoked.restoredRemainingPasses).toBe(1);
    expect(txMock.guestPass.update).toHaveBeenCalledWith({
      where: { id: 'pass-10' },
      data: { remainingPasses: { increment: 1 }, isActive: true },
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
    expect(txMock.visit.create).toHaveBeenCalledTimes(1);
    expect(monitorGatewayMock.emitCheckInResult).toHaveBeenCalledTimes(1);
  });
});
