import {
  CheckInStatus,
  GUEST_ARRIVALS_LIMIT,
  MEMBERSHIP_ARRIVAL_PASS_NAME,
  Role,
  VisitType,
} from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestsService } from './guests.service';

const STUDIO = 'default-studio';
const staff = { id: 'staff-1', name: 'Kiss Réka' };
const hypoxiPass = {
  id: 'pass-hypoxi',
  studioId: STUDIO,
  guestId: 'guest-1',
  passTemplateId: 'tpl-hypoxi',
  serviceId: 'srv-hypoxi',
  type: 'OCCASION_BASED',
  totalPasses: 10,
  remainingPasses: 9,
  startDate: new Date('2026-11-01T09:00:00.000Z'),
  expirationDate: new Date('2026-12-31T22:59:59.000Z'),
  isActive: true,
  isFrozen: false,
  frozenAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-11-01T09:00:00.000Z'),
  passTemplate: {
    name: '10 Alkalmas Hypoxi Bérlet',
    serviceId: 'srv-hypoxi',
    service: { name: 'Hypoxi' },
  },
  service: { name: 'Hypoxi' },
};
const circuitPass = {
  ...hypoxiPass,
  id: 'pass-circuit',
  passTemplateId: 'tpl-circuit',
  serviceId: null,
  type: 'TIME_BASED',
  totalPasses: null,
  remainingPasses: null,
  passTemplate: { name: 'Havi Köredzés Bérlet', serviceId: null, service: null },
  service: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkIn = (overrides: Record<string, any>) => ({
  studioId: STUDIO,
  guestId: 'guest-1',
  guestPassId: null,
  guestPass: null,
  userId: staff.id,
  user: staff,
  visitType: 'CIRCUIT_TRAINING',
  status: 'SUCCESS',
  reason: null,
  passUsage: null,
  ...overrides,
});

describe('GuestsService — belépések a vendégadatlapon (TICKET-40)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let service: GuestsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const givenGuest = (checkIns: any[]) => {
    prismaMock.guest.findFirst.mockResolvedValue({
      id: 'guest-1',
      studioId: STUDIO,
      barcode: '100002',
      firstName: 'Dóra',
      lastName: 'Horváth',
      email: null,
      phone: null,
      birthDate: null,
      nameDay: null,
      status: 'ACTIVE',
      notes: null,
      isActive: true,
      createdAt: new Date('2026-10-01T09:00:00.000Z'),
      updatedAt: new Date('2026-10-01T09:00:00.000Z'),
      passes: [],
      checkIns,
    });
  };

  beforeEach(() => {
    prismaMock = { guest: { findFirst: vi.fn() } };
    const financeMock = { ensureDuesForGuest: vi.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new GuestsService(prismaMock as any, financeMock as any);
  });

  it('a lekérés a beléptetési naplót kéri, legújabb elöl, korlátozva, dupla beolvasás nélkül', async () => {
    givenGuest([]);
    await service.findOne('guest-1', STUDIO);

    const { include } = prismaMock.guest.findFirst.mock.calls[0][0];
    expect(include.checkIns).toMatchObject({
      where: { status: { not: 'DUPLICATE_SCAN' } },
      orderBy: { createdAt: 'desc' },
      take: GUEST_ARRIVALS_LIMIT,
    });
    expect(include.checkIns.include).toMatchObject({
      user: true,
      passUsage: { include: { service: true } },
    });
  });

  it('kezelés, tagsággal és időalapú bérlettel történt köredzés, sztornó és elutasítás leképezése', async () => {
    givenGuest([
      checkIn({
        id: 'chk-treatment',
        createdAt: new Date('2026-11-10T08:00:00.000Z'),
        visitType: 'TREATMENT',
        guestPassId: hypoxiPass.id,
        guestPass: hypoxiPass,
        reason: 'Kezelés: Hypoxi',
        passUsage: { service: { name: 'Hypoxi' } },
      }),
      checkIn({
        id: 'chk-membership',
        createdAt: new Date('2026-11-11T07:30:00.000Z'),
      }),
      checkIn({
        id: 'chk-circuit-pass',
        createdAt: new Date('2026-11-09T16:00:00.000Z'),
        guestPassId: circuitPass.id,
        guestPass: circuitPass,
      }),
      checkIn({
        id: 'chk-voided',
        createdAt: new Date('2026-11-08T10:00:00.000Z'),
        visitType: 'TREATMENT',
        status: 'CANCELLED',
        guestPassId: hypoxiPass.id,
        guestPass: hypoxiPass,
        reason: 'Recepciós sztornó: Téves beléptetés',
        passUsage: { service: { name: 'Hypoxi' } },
      }),
      checkIn({
        id: 'chk-denied',
        createdAt: new Date('2026-11-07T10:00:00.000Z'),
        status: 'DENIED',
        guestPassId: hypoxiPass.id,
        guestPass: hypoxiPass,
        reason: 'Nincs érvényes bérlet.',
      }),
    ]);

    const guest = await service.findOne('guest-1', STUDIO);

    expect(guest.arrivals?.map((a) => a.id)).toEqual([
      'chk-membership',
      'chk-treatment',
      'chk-circuit-pass',
      'chk-voided',
      'chk-denied',
    ]);
    const byId = Object.fromEntries((guest.arrivals ?? []).map((a) => [a.id, a]));

    expect(byId['chk-treatment']).toEqual({
      id: 'chk-treatment',
      occurredAt: '2026-11-10T08:00:00.000Z',
      visitType: VisitType.TREATMENT,
      serviceName: 'Hypoxi',
      guestPassId: hypoxiPass.id,
      passName: '10 Alkalmas Hypoxi Bérlet',
      staffName: 'Kiss Réka',
      status: CheckInStatus.SUCCESS,
      reason: null,
    });
    expect(byId['chk-membership']).toMatchObject({
      visitType: VisitType.CIRCUIT_TRAINING,
      serviceName: null,
      guestPassId: null,
      passName: MEMBERSHIP_ARRIVAL_PASS_NAME,
      status: CheckInStatus.SUCCESS,
    });
    expect(byId['chk-circuit-pass']).toMatchObject({
      guestPassId: circuitPass.id,
      passName: 'Havi Köredzés Bérlet',
      status: CheckInStatus.SUCCESS,
    });
    expect(byId['chk-voided']).toMatchObject({
      status: CheckInStatus.CANCELLED,
      reason: 'Recepciós sztornó: Téves beléptetés',
      serviceName: 'Hypoxi',
    });
    // Elutasításnál a napló a legutóbbi bérletet jegyzi, szolgáltatás nem történt.
    expect(byId['chk-denied']).toMatchObject({
      status: CheckInStatus.DENIED,
      reason: 'Nincs érvényes bérlet.',
      serviceName: null,
      passName: '10 Alkalmas Hypoxi Bérlet',
    });
  });

  it('a dupla beolvasás nem belépés, és a rögzítő hiányában a recepció a rögzítő', async () => {
    givenGuest([
      checkIn({
        id: 'chk-dup',
        createdAt: new Date('2026-11-11T07:30:05.000Z'),
        status: 'DUPLICATE_SCAN',
      }),
      checkIn({
        id: 'chk-ok',
        createdAt: new Date('2026-11-11T07:30:00.000Z'),
        user: null,
      }),
    ]);

    const guest = await service.findOne('guest-1', STUDIO);

    expect(guest.arrivals?.map((a) => a.id)).toEqual(['chk-ok']);
    expect(guest.arrivals?.[0].staffName).toBe('Recepciós Munkatárs');
  });
});

describe('GuestsService — mérés törlése (TICKET-8)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  let service: GuestsService;

  const admin = { id: 'admin-1', studioId: STUDIO, email: 'admin@x.hu', name: 'Admin', role: Role.ADMIN };
  const recorder = { id: staff.id, studioId: STUDIO, email: 'reka@x.hu', name: staff.name, role: Role.RECEPTIONIST };
  const otherStaff = { id: 'staff-2', studioId: STUDIO, email: 'anna@x.hu', name: 'Nagy Anna', role: Role.RECEPTIONIST };
  const measurement = {
    id: 'ms-1',
    guestId: 'guest-1',
    recordedById: staff.id,
    measuredAt: new Date('2026-11-10T09:00:00.000Z'),
  };

  beforeEach(() => {
    txMock = {
      measurement: { delete: vi.fn().mockResolvedValue(measurement) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    prismaMock = {
      measurement: { findFirst: vi.fn().mockResolvedValue(measurement) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn((cb: (tx: any) => unknown) => cb(txMock)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new GuestsService(prismaMock as any, {} as any);
  });

  it('a rögzítő munkatárs törölheti, a törlés naplózódik', async () => {
    const res = await service.deleteMeasurement('guest-1', 'ms-1', recorder);

    expect(res).toEqual({ deletedId: 'ms-1' });
    expect(prismaMock.measurement.findFirst).toHaveBeenCalledWith({
      where: { id: 'ms-1', guestId: 'guest-1', guest: { studioId: STUDIO } },
    });
    expect(txMock.measurement.delete).toHaveBeenCalledWith({ where: { id: 'ms-1' } });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studioId: STUDIO,
        userId: recorder.id,
        action: 'MEASUREMENT_DELETED',
        entityType: 'Measurement',
        entityId: 'ms-1',
      }),
    });
  });

  it('adminisztrátor más által rögzített mérést is törölhet', async () => {
    await expect(service.deleteMeasurement('guest-1', 'ms-1', admin)).resolves.toEqual({
      deletedId: 'ms-1',
    });
    expect(txMock.measurement.delete).toHaveBeenCalledTimes(1);
  });

  it('más munkatárs nem törölheti: 403, és semmi nem törlődik', async () => {
    await expect(service.deleteMeasurement('guest-1', 'ms-1', otherStaff)).rejects.toMatchObject({
      code: 'GUEST.MEASUREMENT_DELETE_FORBIDDEN',
      status: 403,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('ismeretlen rögzítőjű mérést csak adminisztrátor törölhet', async () => {
    prismaMock.measurement.findFirst.mockResolvedValue({ ...measurement, recordedById: null });

    await expect(service.deleteMeasurement('guest-1', 'ms-1', recorder)).rejects.toMatchObject({
      code: 'GUEST.MEASUREMENT_DELETE_FORBIDDEN',
    });
    await expect(service.deleteMeasurement('guest-1', 'ms-1', admin)).resolves.toEqual({
      deletedId: 'ms-1',
    });
  });

  it('nem létező vagy más vendéghez tartozó mérés: 404', async () => {
    prismaMock.measurement.findFirst.mockResolvedValue(null);

    await expect(service.deleteMeasurement('guest-2', 'ms-1', admin)).rejects.toMatchObject({
      code: 'GUEST.MEASUREMENT_NOT_FOUND',
      status: 404,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
