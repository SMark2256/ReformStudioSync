import {
  getPassStatus,
  PassStatus,
  PassType,
  PaymentMethod,
} from '@reform/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockBookingEngine } from './mock-booking';
import { mockStudioEngine } from './mock-engine';

const errorOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

/** 2026-11-26, csütörtök, 10:00 Budapest (téli idő). */
const NOW = new Date('2026-11-26T09:00:00.000Z');

/** TICKET-7: a böngészős mock ugyanúgy kezeli a napijegyet, mint az API. */
describe('mock-engine — napijegy (TICKET-7)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    mockStudioEngine.resetDatabase();
    mockBookingEngine.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sellDayTicket = () =>
    mockStudioEngine.sellPass({
      guestId: 'guest-3',
      passTemplateId: 'tpl-1',
      paymentMethod: PaymentMethod.CASH,
    }).pass;

  it('a demó „1 Alkalmas Napijegy” sablon napijegy típusú, 1 alkalmas', () => {
    const tpl = mockStudioEngine.getTemplates().find((t) => t.id === 'tpl-1');
    expect(tpl).toMatchObject({ type: PassType.DAY_TICKET, totalPasses: 1 });
  });

  it('eladáskor a lejárat a nap zárása (19:00), és zárás után lejárt', () => {
    const pass = sellDayTicket();
    expect(pass.validUntil).toBe('2026-11-26T18:00:00.000Z');
    expect(pass.expirationDate).toBe('2026-11-26T18:00:00.000Z');
    expect(getPassStatus(pass, new Date('2026-11-26T17:59:00.000Z'))).toBe(PassStatus.ACTIVE);
    expect(getPassStatus(pass, new Date('2026-11-26T18:01:00.000Z'))).toBe(PassStatus.EXPIRED);
  });

  it('a foglalási Beállítások nyitvatartását használja; a későbbi módosítás az eladott jegyet nem érinti', () => {
    const openingHours = [...mockBookingEngine.settingsBundle().settings.openingHours];
    openingHours[3] = { opensAt: 7 * 60, closesAt: 20 * 60, lastStartAt: 19 * 60 };
    mockBookingEngine.updateSettings({ openingHours });

    const pass = sellDayTicket();
    expect(pass.validUntil).toBe('2026-11-26T19:00:00.000Z');

    openingHours[3] = { opensAt: 7 * 60, closesAt: 12 * 60, lastStartAt: 11 * 60 };
    mockBookingEngine.updateSettings({ openingHours });
    const stored = mockStudioEngine.getGuestPasses('guest-3').find((p) => p.id === pass.id);
    expect(stored?.validUntil).toBe('2026-11-26T19:00:00.000Z');
  });

  it('zárt napon (szombat) a nap végéig érvényes', () => {
    vi.setSystemTime(new Date('2026-11-28T10:00:00.000Z'));
    expect(sellDayTicket().validUntil).toBe('2026-11-28T22:59:59.999Z');
  });

  it('nem hosszabbítható és nem fagyasztható: PASS.DAY_TICKET_FIXED', () => {
    const pass = sellDayTicket();
    expect(errorOf(() => mockStudioEngine.extendPass(pass.id, 7, 'teszt'))).toMatchObject({
      code: 'PASS.DAY_TICKET_FIXED',
    });
    expect(errorOf(() => mockStudioEngine.toggleFreezePass(pass.id))).toMatchObject({
      code: 'PASS.DAY_TICKET_FIXED',
    });
  });

  it('a levonás az egyetlen alkalmat használja fel, lejárati figyelmeztetés nélkül', () => {
    const pass = sellDayTicket();
    const res = mockStudioEngine.deductPassUsage({
      guestId: 'guest-3',
      passId: pass.id,
      serviceId: 'srv-reformer',
    });
    expect(res.remainingPasses).toBe(0);
    expect(res.warnings).not.toContain('EXPIRING_SOON');
    const stored = mockStudioEngine.getGuestPasses('guest-3').find((p) => p.id === pass.id);
    expect(stored?.status).toBe(PassStatus.DEPLETED);
  });
});
