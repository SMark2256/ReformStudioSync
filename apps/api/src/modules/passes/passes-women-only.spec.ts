import { PaymentMethod } from '@reform/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassesService } from './passes.service';

/** TICKET-42: csak nőknek szóló bérlet eladása és kezeléslevonás férfi / női / ismeretlen nemű vendéggel. */
describe('PassesService — csak nőknek szóló bérlet és kezelés (TICKET-42)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  let passesService: PassesService;

  const circuitService = {
    id: 'srv-circuit',
    name: 'Női Köredzés (Havi Tagság)',
    category: 'CIRCUIT',
    womenOnly: true,
  };
  const hypoxiService = {
    id: 'srv-hypoxi',
    name: 'Hypoxi',
    category: 'BODY_SHAPING',
    womenOnly: false,
  };
  const guest = (gender: string) => ({
    id: 'guest-1',
    studioId: 'default-studio',
    firstName: gender === 'MALE' ? 'Péter' : 'Anna',
    lastName: 'Teszt',
    barcode: '100099',
    gender,
    isActive: true,
  });
  const template = (service: typeof circuitService | null) => ({
    id: 'tpl-1',
    studioId: 'default-studio',
    serviceId: service?.id ?? null,
    service,
    name: service ? 'Havi Korlátlan Köredzés Bérlet' : '10 Alkalmas Bérlet',
    type: service ? 'TIME_BASED' : 'OCCASION_BASED',
    totalPasses: service ? null : 10,
    durationDays: 30,
    price: 22000,
    isActive: true,
  });
  /** Szolgáltatáshoz nem kötött, 10 alkalmas bérlet (bármely kezelésre levonható). */
  const openPass = (service: typeof circuitService | null = null) => ({
    id: 'pass-1',
    studioId: 'default-studio',
    guestId: 'guest-1',
    passTemplateId: 'tpl-1',
    serviceId: service?.id ?? null,
    service,
    type: 'OCCASION_BASED',
    totalPasses: 10,
    remainingPasses: 6,
    startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    expirationDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    usageLogs: Array.from({ length: 4 }, () => ({ delta: -1, reversedAt: null })),
    isActive: true,
    isFrozen: false,
    cancelledAt: null,
    passTemplate: { name: '10 Alkalmas Bérlet', serviceId: service?.id ?? null, service },
  });

  beforeEach(() => {
    txMock = {
      guest: { findFirst: vi.fn() },
      service: { findFirst: vi.fn() },
      passTemplate: { findFirst: vi.fn() },
      guestPass: {
        findFirst: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: vi.fn(async ({ data }: { data: any }) => ({
          id: 'new-pass',
          ...data,
          createdAt: new Date(),
          passTemplate: { name: 'Bérlet' },
        })),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passUsageLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'usage-1' }),
      },
      loggedCheckIn: { create: vi.fn().mockResolvedValue({ id: 'chk-1' }) },
      visit: { create: vi.fn().mockResolvedValue({ id: 'visit-1' }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payment: { create: vi.fn(async ({ data }: { data: any }) => ({ id: 'pay-1', ...data })) },
      paymentAllocation: { create: vi.fn().mockResolvedValue({ id: 'alloc-1' }) },
    };
    const prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passesService = new PassesService(prismaMock as any, { emitCheckInResult: vi.fn() } as any);
  });

  const sell = () =>
    passesService.sellPass(
      { guestId: 'guest-1', passTemplateId: 'tpl-1', paymentMethod: PaymentMethod.CASH },
      'staff-1',
    );
  const deduct = (serviceId: string) =>
    passesService.deductTreatmentUsage(
      { guestId: 'guest-1', passId: 'pass-1', serviceId },
      'staff-1',
    );

  describe('eladás', () => {
    it('női vendégnek a köredzés bérlet eladható', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('FEMALE'));
      txMock.passTemplate.findFirst.mockResolvedValue(template(circuitService));

      const res = await sell();

      expect(res.paymentId).toBe('pay-1');
      expect(txMock.guestPass.create).toHaveBeenCalledTimes(1);
    });

    it('férfi vendégnek a köredzés bérlet nem adható el: PASS.WOMEN_ONLY, semmi nem rögzül', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('MALE'));
      txMock.passTemplate.findFirst.mockResolvedValue(template(circuitService));

      await expect(sell()).rejects.toMatchObject({ code: 'PASS.WOMEN_ONLY' });
      expect(txMock.guestPass.create).not.toHaveBeenCalled();
      expect(txMock.payment.create).not.toHaveBeenCalled();
    });

    it('férfi vendégnek a nem csak nőknek szóló bérlet eladható', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('MALE'));
      txMock.passTemplate.findFirst.mockResolvedValue(template(null));

      await expect(sell()).resolves.toMatchObject({ paymentId: 'pay-1' });
    });

    it('nincs megadva nemnél a köredzés bérlet eladható', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('UNSPECIFIED'));
      txMock.passTemplate.findFirst.mockResolvedValue(template(circuitService));

      await expect(sell()).resolves.toMatchObject({ paymentId: 'pay-1' });
    });
  });

  describe('kezeléslevonás', () => {
    it('női vendég: a csak nőknek szóló kezelés levonható', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('FEMALE'));
      txMock.guestPass.findFirst.mockResolvedValue(openPass());
      txMock.service.findFirst.mockResolvedValue(circuitService);

      const res = await deduct('srv-circuit');

      expect(res.status).toBe('SUCCESS');
      expect(res.warnings).not.toContain('GENDER_MISSING');
    });

    it('férfi vendég: a csak nőknek szóló kezelés nem vonható le: CHECKIN.WOMEN_ONLY, nincs belépés', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('MALE'));
      txMock.guestPass.findFirst.mockResolvedValue(openPass());
      txMock.service.findFirst.mockResolvedValue(circuitService);

      await expect(deduct('srv-circuit')).rejects.toMatchObject({
        code: 'CHECKIN.WOMEN_ONLY',
      });
      expect(txMock.loggedCheckIn.create).not.toHaveBeenCalled();
      expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
    });

    it('férfi vendég: csak nőknek szóló szolgáltatáshoz kötött bérletről sem vonható le', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('MALE'));
      txMock.guestPass.findFirst.mockResolvedValue(openPass(circuitService));
      txMock.service.findFirst.mockResolvedValue(circuitService);

      await expect(deduct('srv-circuit')).rejects.toMatchObject({
        code: 'CHECKIN.WOMEN_ONLY',
      });
    });

    it('férfi vendég: más kezelés levonható', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('MALE'));
      txMock.guestPass.findFirst.mockResolvedValue(openPass());
      txMock.service.findFirst.mockResolvedValue(hypoxiService);

      await expect(deduct('srv-hypoxi')).resolves.toMatchObject({ status: 'SUCCESS' });
    });

    it('nincs megadva nem: levonható, de GENDER_MISSING figyelmeztetéssel', async () => {
      txMock.guest.findFirst.mockResolvedValue(guest('UNSPECIFIED'));
      txMock.guestPass.findFirst.mockResolvedValue(openPass());
      txMock.service.findFirst.mockResolvedValue(circuitService);

      const res = await deduct('srv-circuit');

      expect(res.status).toBe('SUCCESS');
      expect(res.warnings).toContain('GENDER_MISSING');
    });
  });
});
