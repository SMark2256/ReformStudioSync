import { frozenDaysBetween } from '@reform/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassesService } from './passes.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const STUDIO = 'default-studio';
// Novemberben a stúdió (Europe/Budapest) UTC+1-ben van.
const EXPIRATION = new Date('2026-11-30T22:59:59.000Z');

describe('PassesService.toggleFreezePass — naptári napos jóváírás és érvényes bérlet (TICKET-41)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  let passesService: PassesService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const givenPass = (overrides: Record<string, any> = {}) => {
    const pass = {
      id: 'pass-1',
      studioId: STUDIO,
      guestId: 'guest-1',
      passTemplateId: 'tpl-10',
      type: 'OCCASION_BASED',
      totalPasses: 10,
      remainingPasses: 8,
      startDate: new Date('2026-10-01T10:00:00.000Z'),
      expirationDate: EXPIRATION,
      isActive: true,
      isFrozen: false,
      frozenAt: null,
      cancelledAt: null,
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      passTemplate: { name: '10 Alkalmas Hypoxi Bérlet' },
      usageLogs: [
        { id: 'u-1', delta: -1, reversedAt: null, usedAt: new Date('2026-10-05T10:00:00.000Z') },
        { id: 'u-2', delta: -1, reversedAt: null, usedAt: new Date('2026-10-12T10:00:00.000Z') },
      ],
      ...overrides,
    };
    txMock.guestPass.findFirst.mockResolvedValue(pass);
    txMock.guestPass.update.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ data }: { data: any }) => ({ ...pass, ...data }),
    );
    return pass;
  };

  const addedDays = (expirationDate: string) =>
    Math.round((new Date(expirationDate).getTime() - EXPIRATION.getTime()) / DAY_MS);

  beforeEach(() => {
    txMock = {
      guestPass: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      passUsageLog: {
        create: vi.fn().mockResolvedValue({ id: 'usage-freeze-1' }),
      },
    };
    const prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passesService = new PassesService(prismaMock as any);
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('frozenDaysBetween: a stúdió naptári napjait számolja, legalább 1-et', () => {
    // 11.07 12:46 → 11.11 18:39 (helyi idő) = 4 nap, nem 5.
    expect(
      frozenDaysBetween('2026-11-07T11:46:00.000Z', '2026-11-11T17:39:00.000Z'),
    ).toBe(4);
    // Ugyanazon a napon feloldva is 1 nap jár.
    expect(
      frozenDaysBetween('2026-11-11T08:00:00.000Z', '2026-11-11T09:00:00.000Z'),
    ).toBe(1);
    // Helyi éjfél után (UTC szerint még előző nap) is a helyi nap számít.
    expect(
      frozenDaysBetween('2026-11-09T22:30:00.000Z', '2026-11-10T23:30:00.000Z'),
    ).toBe(2);
  });

  it('4 nap 6 óra fagyasztás után +4 nap jár a lejáratra (nem +5)', async () => {
    givenPass({ isFrozen: true, frozenAt: new Date('2026-11-07T11:00:00.000Z') });
    vi.setSystemTime(new Date('2026-11-11T17:00:00.000Z'));

    const res = await passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO);

    expect(res.isFrozen).toBe(false);
    expect(addedDays(res.expirationDate)).toBe(4);
    expect(txMock.passUsageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        note: 'Fagyasztás feloldva (+4 nap jóváírva a lejáratra)',
      }),
    });
  });

  it('éjfélen átnyúló fagyasztás: a helyi naptári napok számítanak', async () => {
    // Fagyasztva 11.09 23:30-kor, feloldva 11.11 00:30-kor (helyi idő): 25 óra, de két naptári nap.
    givenPass({ isFrozen: true, frozenAt: new Date('2026-11-09T22:30:00.000Z') });
    vi.setSystemTime(new Date('2026-11-10T23:30:00.000Z'));

    const res = await passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO);

    expect(addedDays(res.expirationDate)).toBe(2);
  });

  it('egy éjfélen át, két napnyi idő alatt csak 1 nap jár', async () => {
    // 11.09 00:10 → 11.10 23:50 (helyi idő): közel 48 óra, de csak egy naptári nap telt el.
    givenPass({ isFrozen: true, frozenAt: new Date('2026-11-08T23:10:00.000Z') });
    vi.setSystemTime(new Date('2026-11-10T22:50:00.000Z'));

    const res = await passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO);

    expect(addedDays(res.expirationDate)).toBe(1);
  });

  it('aktív bérlet fagyasztható, és a naplóba bekerül a rögzítő munkatárs', async () => {
    givenPass();
    vi.setSystemTime(new Date('2026-11-07T11:46:00.000Z'));

    const res = await passesService.toggleFreezePass(
      'pass-1',
      { note: 'Szabadság' },
      'staff-1',
      STUDIO,
    );

    expect(res.isFrozen).toBe(true);
    expect(txMock.passUsageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guestPassId: 'pass-1',
        employeeId: 'staff-1',
        delta: 0,
        note: 'Bérlet fagyasztva: Szabadság',
      }),
    });
  });

  it('még nem kezdődött bérlet is fagyasztható', async () => {
    givenPass({ startDate: new Date('2026-11-20T10:00:00.000Z') });
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));

    const res = await passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO);

    expect(res.isFrozen).toBe(true);
  });

  it('lejárt bérlet nem fagyasztható', async () => {
    givenPass({ expirationDate: new Date('2026-11-05T22:59:59.000Z') });
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));

    await expect(
      passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO),
    ).rejects.toMatchObject({ code: 'PASS.NOT_FREEZABLE' });
    expect(txMock.guestPass.update).not.toHaveBeenCalled();
    expect(txMock.passUsageLog.create).not.toHaveBeenCalled();
  });

  it('elfogyott alkalmas bérlet nem fagyasztható', async () => {
    givenPass({
      totalPasses: 2,
      remainingPasses: 0,
    });
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));

    await expect(
      passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO),
    ).rejects.toMatchObject({ code: 'PASS.NOT_FREEZABLE' });
    expect(txMock.guestPass.update).not.toHaveBeenCalled();
  });

  it('sztornózott bérlet nem fagyasztható', async () => {
    givenPass({ cancelledAt: new Date('2026-11-01T10:00:00.000Z') });
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));

    await expect(
      passesService.toggleFreezePass('pass-1', {}, 'staff-1', STUDIO),
    ).rejects.toMatchObject({ code: 'PASS.NOT_FREEZABLE' });
  });

  it('a feloldás lejárt bérletnél is megy, és a naplóba bekerül a rögzítő munkatárs', async () => {
    givenPass({
      isFrozen: true,
      frozenAt: new Date('2026-11-01T10:00:00.000Z'),
      expirationDate: new Date('2026-11-05T22:59:59.000Z'),
    });
    vi.setSystemTime(new Date('2026-11-11T10:00:00.000Z'));

    const res = await passesService.toggleFreezePass('pass-1', {}, 'staff-2', STUDIO);

    expect(res.isFrozen).toBe(false);
    // 11.01 → 11.11 = 10 naptári nap a 11.05-i lejáratra: 11.15.
    expect(new Date(res.expirationDate).toISOString()).toBe('2026-11-15T22:59:59.000Z');
    expect(txMock.passUsageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'staff-2',
        delta: 0,
        note: 'Fagyasztás feloldva (+10 nap jóváírva a lejáratra)',
      }),
    });
  });
});
