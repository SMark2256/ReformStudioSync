import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingNotificationsService } from './booking-notifications.service';
import {
  hashOpaqueToken,
  isWellFormedToken,
  manageTokenFor,
  signGuestSession,
  verifyGuestSession,
} from './booking-tokens';
import { parseIdList } from './bookings.controller';
import { BOOKING_JOBS_INTERVAL_MS, BookingsScheduler } from './bookings.scheduler';
import type { CalendarSyncService } from './calendar-sync.service';
import { clientAddress, PublicRateLimitGuard } from './public-rate-limit.guard';
import type { WaitlistService } from './waitlist.service';

/** TICKET-57: a nyilvános foglaló védelmei (tokenek, kéréskorlát) és a háttérfeladatok. */

const NOW = new Date('2026-11-17T10:00:00.000Z');

describe('vendégtokenek', () => {
  it('a kezelőlink foglalásonként egyedi, determinisztikus, és csak a hash-e tárolódik', () => {
    const a = manageTokenFor('titok', 'booking-a');
    expect(a).toBe(manageTokenFor('titok', 'booking-a'));
    expect(a).not.toBe(manageTokenFor('titok', 'booking-b'));
    expect(a).not.toBe(manageTokenFor('masik-titok', 'booking-a'));
    expect(isWellFormedToken(a)).toBe(true);
    expect(hashOpaqueToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hibás alakú token a hash-keresés előtt kiesik', () => {
    expect(isWellFormedToken('rovid')).toBe(false);
    expect(isWellFormedToken("' OR 1=1 --")).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
  });

  it('a vendég munkamenete aláírt és lejár', () => {
    const token = signGuestSession('titok', 'guest-1', new Date(NOW.getTime() + 60_000));
    expect(verifyGuestSession('titok', token, NOW)).toBe('guest-1');
    expect(verifyGuestSession('titok', token, new Date(NOW.getTime() + 61_000))).toBeNull();
    expect(verifyGuestSession('masik', token, NOW)).toBeNull();
    expect(verifyGuestSession('titok', token.replace('guest-1', 'guest-2'), NOW)).toBeNull();
    expect(verifyGuestSession('titok', 'szemét', NOW)).toBeNull();
  });
});

describe('kéréskorlát', () => {
  it('címenként és végpontonként az időablakban legfeljebb a megadott számú kérés', () => {
    const guard = new PublicRateLimitGuard(new Reflector());
    const rule = { limit: 2, windowMs: 60_000 };
    const t = NOW.getTime();
    expect(guard.hit('kod:1.1.1.1', rule, t)).toBe(true);
    expect(guard.hit('kod:1.1.1.1', rule, t + 1)).toBe(true);
    let error: unknown;
    try {
      guard.hit('kod:1.1.1.1', rule, t + 2);
    } catch (err) {
      error = err;
    }
    expect(error).toMatchObject({ code: 'BOOKING.RATE_LIMITED' });
    // Másik cím, és az ablak lejárta után újra mehet.
    expect(guard.hit('kod:2.2.2.2', rule, t + 2)).toBe(true);
    expect(guard.hit('kod:1.1.1.1', rule, t + 60_001)).toBe(true);
  });

  it('a kliens címe az X-Forwarded-For utolsó eleme (a proxy fűzi hozzá)', () => {
    expect(clientAddress({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, ip: '10.0.0.1' })).toBe(
      '203.0.113.9',
    );
    expect(clientAddress({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });

  it('az azonosítólista vesszővel vagy ismételt paraméterrel, legfeljebb 10 elem', () => {
    expect(parseIdList('a, b,,c')).toEqual(['a', 'b', 'c']);
    expect(parseIdList(['a', 'b,c'])).toEqual(['a', 'b', 'c']);
    expect(parseIdList(undefined)).toEqual([]);
    expect(parseIdList(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
});

describe('BookingsScheduler — emlékeztető, várólista-lejárat, Google outbox', () => {
  let sendDueReminders: ReturnType<typeof vi.fn>;
  let expireOffers: ReturnType<typeof vi.fn>;
  let processDue: ReturnType<typeof vi.fn>;
  let scheduler: BookingsScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    sendDueReminders = vi.fn().mockResolvedValue(0);
    expireOffers = vi.fn().mockResolvedValue(0);
    processDue = vi.fn().mockResolvedValue({ done: 0, failed: 0 });
    scheduler = new BookingsScheduler(
      { sendDueReminders } as unknown as BookingNotificationsService,
      { expireOffers } as unknown as WaitlistService,
      { processDue } as unknown as CalendarSyncService,
    );
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('indításkor, majd percenként fut mindhárom lépés', async () => {
    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendDueReminders).toHaveBeenCalledTimes(1);
    expect(expireOffers).toHaveBeenCalledTimes(1);
    expect(processDue).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BOOKING_JOBS_INTERVAL_MS);
    expect(sendDueReminders).toHaveBeenCalledTimes(2);

    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(BOOKING_JOBS_INTERVAL_MS);
    expect(sendDueReminders).toHaveBeenCalledTimes(2);
  });

  it('egy lépés hibája nem állítja meg a többit, és nem dönti el az alkalmazást', async () => {
    sendDueReminders.mockRejectedValueOnce(new Error('levél hiba'));
    await expect(scheduler.run(NOW)).resolves.toBeUndefined();
    expect(expireOffers).toHaveBeenCalledWith(NOW);
    expect(processDue).toHaveBeenCalledWith(NOW);
  });
});
