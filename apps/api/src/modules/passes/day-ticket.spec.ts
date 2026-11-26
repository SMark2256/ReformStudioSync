import {
  DEFAULT_OPENING_HOURS,
  dayTicketValidUntil,
  getPassStatus,
  isOccasionPassType,
  isPassOpen,
  PassStatus,
  PassType,
  resolveArrivalEntitlement,
  type WeeklyOpeningHours,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

const DEFAULTS = { openingHours: DEFAULT_OPENING_HOURS };

/** Napijegy (TICKET-7): lejárat a vásárlás napjának zárásakor, egyetlen forrás az API-n és a mockban. */
describe('dayTicketValidUntil — napijegy lejárata', () => {
  it('nyitvatartási napon a nap zárása (csütörtök 19:00, téli idő: 18:00 UTC)', () => {
    expect(
      dayTicketValidUntil(new Date('2026-11-26T09:15:00.000Z'), DEFAULTS).toISOString(),
    ).toBe('2026-11-26T18:00:00.000Z');
  });

  it('nyári időszámításban is helyi 19:00 (17:00 UTC)', () => {
    expect(
      dayTicketValidUntil(new Date('2026-07-15T06:00:00.000Z'), DEFAULTS).toISOString(),
    ).toBe('2026-07-15T17:00:00.000Z');
  });

  it('a Beállítások fül nyitvatartását használja (csütörtök 20:00-ig)', () => {
    const openingHours: WeeklyOpeningHours = [...DEFAULT_OPENING_HOURS];
    openingHours[3] = { opensAt: 7 * 60, closesAt: 20 * 60, lastStartAt: 19 * 60 };
    expect(
      dayTicketValidUntil(new Date('2026-11-26T09:15:00.000Z'), { openingHours }).toISOString(),
    ).toBe('2026-11-26T19:00:00.000Z');
  });

  it('zárt napon (hétvége) a nap végéig érvényes', () => {
    expect(
      dayTicketValidUntil(new Date('2026-11-28T10:00:00.000Z'), DEFAULTS).toISOString(),
    ).toBe('2026-11-28T22:59:59.999Z');
  });

  it('munkaszüneti napon a nap vége, recepciós nyitva-felülírással a heti zárás', () => {
    const christmas = new Date('2026-12-25T09:00:00.000Z');
    expect(dayTicketValidUntil(christmas, DEFAULTS).toISOString()).toBe(
      '2026-12-25T22:59:59.999Z',
    );
    expect(
      dayTicketValidUntil(christmas, DEFAULTS, [{ dayKey: '2026-12-25', isOpen: true }]).toISOString(),
    ).toBe('2026-12-25T18:00:00.000Z');
  });

  it('zárás utáni eladásnál a nap végéig érvényes (ne járjon le azonnal)', () => {
    expect(
      dayTicketValidUntil(new Date('2026-11-26T18:30:00.000Z'), DEFAULTS).toISOString(),
    ).toBe('2026-11-26T22:59:59.999Z');
  });
});

describe('napijegy állapota és beléptetési döntés', () => {
  const dayTicket = (over: Record<string, unknown> = {}) => ({
    id: 'pass-day',
    type: PassType.DAY_TICKET as PassType,
    remainingPasses: 1 as number | null,
    startDate: new Date('2026-11-26T09:15:00.000Z'),
    expirationDate: new Date('2026-11-26T18:00:00.000Z'),
    validUntil: new Date('2026-11-26T18:00:00.000Z') as Date | null,
    isFrozen: false,
    cancelledAt: null as Date | null,
    serviceId: null as string | null,
    ...over,
  });

  it('alkalomszámos típus: elfogy, nyitott, amíg van alkalma', () => {
    expect(isOccasionPassType(PassType.DAY_TICKET)).toBe(true);
    expect(isOccasionPassType(PassType.OCCASION_BASED)).toBe(true);
    expect(isOccasionPassType(PassType.TIME_BASED)).toBe(false);
    expect(isPassOpen(dayTicket(), 1)).toBe(true);
    expect(isPassOpen(dayTicket(), 0)).toBe(false);
  });

  it('zárásig érvényes, utána percre pontosan lejárt (nem csak éjfélkor)', () => {
    expect(getPassStatus(dayTicket(), new Date('2026-11-26T17:59:00.000Z'))).toBe(
      PassStatus.ACTIVE,
    );
    expect(getPassStatus(dayTicket(), new Date('2026-11-26T18:01:00.000Z'))).toBe(
      PassStatus.EXPIRED,
    );
  });

  it('felhasználás után elfogyott', () => {
    expect(
      getPassStatus(dayTicket({ remainingPasses: 0 }), new Date('2026-11-26T12:00:00.000Z')),
    ).toBe(PassStatus.DEPLETED);
  });

  it('a tárolt lejárat számít: a régi, `validUntil` nélküli jegy napra pontos marad', () => {
    const legacy = dayTicket({
      validUntil: null,
      expirationDate: new Date('2026-12-01T10:00:00.000Z'),
    });
    expect(getPassStatus(legacy, new Date('2026-12-01T21:00:00.000Z'))).toBe(PassStatus.ACTIVE);
  });

  it('beolvasás: zárás előtt kezelésválasztás (egy alkalom levonása), zárás után elutasítás', () => {
    const passes = [dayTicket()];
    expect(
      resolveArrivalEntitlement({ memberships: [], passes }, new Date('2026-11-26T12:00:00.000Z')),
    ).toEqual({ kind: 'TREATMENT_SELECTION', passes });
    expect(
      resolveArrivalEntitlement({ memberships: [], passes }, new Date('2026-11-26T18:30:00.000Z')),
    ).toEqual({ kind: 'DENIED', reason: 'NO_VALID_PASS' });
  });
});
