import { DEFAULT_OPENING_HOURS, PassType, PaymentMethod } from '@reform/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassesService } from './passes.service';

/** TICKET-7: napijegy sablon, eladás (lejárat a zárásig), hosszabbítás és fagyasztás tiltása. */
describe('PassesService — napijegy (TICKET-7)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let passesService: PassesService;

  // Csütörtök, 10:00 helyi idő (téli időszámítás).
  const SOLD_AT = new Date('2026-11-26T09:00:00.000Z');

  const dayTemplate = {
    id: 'tpl-day',
    studioId: 'default-studio',
    serviceId: null,
    service: null,
    name: '1 Alkalmas Napijegy',
    type: 'DAY_TICKET',
    totalPasses: 1,
    durationDays: 1,
    price: 6500,
    isActive: true,
  };

  const settingsRow = (closesAtThursday: number) => {
    const openingHours = [...DEFAULT_OPENING_HOURS];
    openingHours[3] = { opensAt: 7 * 60, closesAt: closesAtThursday };
    return {
      studioId: 'default-studio',
      openingHours,
      maxAdvanceDays: 30,
      minLeadMinutes: 30,
      changeCutoffHours: 24,
      holdMinutes: 30,
      slotStepMinutes: 15,
      locationText: '',
    };
  };

  const soldDayTicket = {
    id: 'pass-day',
    studioId: 'default-studio',
    guestId: 'guest-1',
    passTemplateId: 'tpl-day',
    serviceId: null,
    type: 'DAY_TICKET',
    totalPasses: 1,
    remainingPasses: 1,
    startDate: SOLD_AT,
    expirationDate: new Date('2026-11-26T18:00:00.000Z'),
    validUntil: new Date('2026-11-26T18:00:00.000Z'),
    isActive: true,
    isFrozen: false,
    frozenAt: null,
    cancelledAt: null,
    createdAt: SOLD_AT,
    usageLogs: [],
    passTemplate: { name: '1 Alkalmas Napijegy' },
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SOLD_AT);
    txMock = {
      guest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'guest-1',
          studioId: 'default-studio',
          gender: 'FEMALE',
          isActive: true,
        }),
      },
      passTemplate: { findFirst: vi.fn().mockResolvedValue(dayTemplate) },
      bookingSettings: { findUnique: vi.fn().mockResolvedValue(settingsRow(19 * 60)) },
      bookingHolidayOverride: { findMany: vi.fn().mockResolvedValue([]) },
      guestPass: {
        findFirst: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: vi.fn(async ({ data }: { data: any }) => ({
          id: 'new-pass',
          ...data,
          frozenAt: null,
          cancelledAt: null,
          createdAt: new Date(),
          passTemplate: { name: dayTemplate.name },
        })),
        update: vi.fn(),
      },
      passUsageLog: { create: vi.fn().mockResolvedValue({ id: 'usage-1' }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payment: { create: vi.fn(async ({ data }: { data: any }) => ({ id: 'pay-1', ...data })) },
      paymentAllocation: { create: vi.fn().mockResolvedValue({ id: 'alloc-1' }) },
    };
    prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
      passTemplate: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: vi.fn(async ({ data }: { data: any }) => ({
          id: 'tpl-new',
          ...data,
          isActive: true,
          createdAt: new Date(),
          service: null,
        })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passesService = new PassesService(prismaMock as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sell = (startDate?: string) =>
    passesService.sellPass(
      {
        guestId: 'guest-1',
        passTemplateId: 'tpl-day',
        paymentMethod: PaymentMethod.CASH,
        startDate,
      },
      'staff-1',
    );

  it('eladáskor a lejárat a nap zárása, tárolva (`validUntil` = `expirationDate`)', async () => {
    const res = await sell();

    const data = txMock.guestPass.create.mock.calls[0][0].data;
    expect(data.type).toBe('DAY_TICKET');
    expect(data.validUntil.toISOString()).toBe('2026-11-26T18:00:00.000Z');
    expect(data.expirationDate.toISOString()).toBe('2026-11-26T18:00:00.000Z');
    expect(res.pass).toMatchObject({
      type: PassType.DAY_TICKET,
      validUntil: '2026-11-26T18:00:00.000Z',
      status: 'ACTIVE',
    });
  });

  it('a foglalási nyitvatartás módosított zárását és a napi felülírást használja', async () => {
    txMock.bookingSettings.findUnique.mockResolvedValue(settingsRow(20 * 60));

    await sell();

    expect(txMock.guestPass.create.mock.calls[0][0].data.validUntil.toISOString()).toBe(
      '2026-11-26T19:00:00.000Z',
    );
    expect(txMock.bookingHolidayOverride.findMany).toHaveBeenCalledWith({
      where: { studioId: 'default-studio', dayKey: '2026-11-26' },
    });
  });

  it('egyedi kezdődátum napijegynél nem számít: a vásárlás napjára szól', async () => {
    await sell('2026-12-03T09:00:00.000Z');

    const data = txMock.guestPass.create.mock.calls[0][0].data;
    expect(data.startDate.toISOString()).toBe(SOLD_AT.toISOString());
    expect(data.validUntil.toISOString()).toBe('2026-11-26T18:00:00.000Z');
  });

  it('a nem napijegy eladása nem olvassa a nyitvatartást, és nincs `validUntil`', async () => {
    txMock.passTemplate.findFirst.mockResolvedValue({
      ...dayTemplate,
      id: 'tpl-10',
      name: '10 Alkalmas Bérlet',
      type: 'OCCASION_BASED',
      totalPasses: 10,
      durationDays: 60,
    });

    await sell();

    expect(txMock.bookingSettings.findUnique).not.toHaveBeenCalled();
    expect(txMock.guestPass.create.mock.calls[0][0].data.validUntil).toBeNull();
  });

  it('napijegy sablon: mindig 1 alkalom, 1 nap, a küldött értékektől függetlenül', async () => {
    const tpl = await passesService.createTemplate({
      name: 'Napijegy',
      type: PassType.DAY_TICKET,
      totalPasses: 5,
      durationDays: 30,
      price: 6500,
    });

    expect(prismaMock.passTemplate.create.mock.calls[0][0].data).toMatchObject({
      type: PassType.DAY_TICKET,
      totalPasses: 1,
      durationDays: 1,
    });
    expect(tpl.totalPasses).toBe(1);
  });

  it('napijegy nem hosszabbítható: PASS.DAY_TICKET_FIXED, nem módosul', async () => {
    txMock.guestPass.findFirst.mockResolvedValue(soldDayTicket);

    await expect(
      passesService.extendPass('pass-day', { additionalDays: 7, note: 'teszt' }),
    ).rejects.toMatchObject({ code: 'PASS.DAY_TICKET_FIXED' });
    expect(txMock.guestPass.update).not.toHaveBeenCalled();
  });

  it('napijegy nem fagyasztható: PASS.DAY_TICKET_FIXED, nem módosul', async () => {
    txMock.guestPass.findFirst.mockResolvedValue(soldDayTicket);

    await expect(
      passesService.toggleFreezePass('pass-day', {}, 'staff-1'),
    ).rejects.toMatchObject({ code: 'PASS.DAY_TICKET_FIXED' });
    expect(txMock.guestPass.update).not.toHaveBeenCalled();
  });
});
