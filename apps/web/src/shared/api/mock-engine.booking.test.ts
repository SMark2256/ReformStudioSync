import { BookingStatus, studioDateTime, WaitlistStatus } from '@reform/shared';
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

/** 2026-11-17, kedd, 11:00 Budapest. */
const NOW = new Date('2026-11-17T10:00:00.000Z');
const DAY = '2026-11-18';
const FAR_DAY = '2026-11-20';
const at = (dayKey: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return studioDateTime(dayKey, h * 60 + m).toISOString();
};

const contact = { lastName: 'Kovács', firstName: 'Anna', email: 'ANNA.kovacs@reform.hu', phone: '+36 30 412 8891' };

/** TICKET-57: a böngészős foglalási mock ugyanazokat a szabályokat követi, mint az API. */
describe('mock-booking — időpontfoglalás (TICKET-57)', () => {
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

  it('a demóadat: online foglalható kezelések a sorrendben, és a mai foglalások', () => {
    expect(mockBookingEngine.catalog().treatments.map((t) => t.name)).toEqual([
      'Hypoxi Trainer',
      'Gépi nyirokmasszázs',
      'HIEMT',
      'Intimpad',
      'Ceragem',
      'Flabelos',
    ]);
    const calendar = mockBookingEngine.calendar('2026-11-17', '2026-11-17');
    expect(calendar.bookings.map((b) => b.guestName)).toContain('Kovács Anna');
    expect(calendar.days[0].hours).toEqual({ opensAt: 420, closesAt: 1080 });
  });

  it('kapacitás: a Ceragem 1 fős, a HIEMT és az Intimpad közös gépen fut', () => {
    mockBookingEngine.createStaffBooking({ guestId: 'guest-1', treatmentIds: ['bt-ceragem'], startsAt: at(DAY, '09:00') });
    expect(
      errorOf(() =>
        mockBookingEngine.createStaffBooking({ guestId: 'guest-2', treatmentIds: ['bt-ceragem'], startsAt: at(DAY, '09:00') }),
      ),
    ).toMatchObject({ code: 'BOOKING.CAPACITY_FULL' });

    mockBookingEngine.createStaffBooking({ guestId: 'guest-2', treatmentIds: ['bt-hiemt'], startsAt: at(DAY, '12:00') });
    expect(
      errorOf(() =>
        mockBookingEngine.createStaffBooking({ guestId: 'guest-3', treatmentIds: ['bt-intimpad'], startsAt: at(DAY, '12:30') }),
      ),
    ).toMatchObject({ code: 'BOOKING.CAPACITY_FULL' });
    expect(
      mockBookingEngine.createStaffBooking({ guestId: 'guest-3', treatmentIds: ['bt-intimpad'], startsAt: at(DAY, '12:35') })
        .bookings,
    ).toHaveLength(1);
  });

  it('a szabad időpontok kihagyják a foglaltat; a recepció felülírja a 30 perces korlátot', () => {
    mockBookingEngine.createStaffBooking({ guestId: 'guest-1', treatmentIds: ['bt-ceragem'], startsAt: at(DAY, '09:00') });
    const slots = mockBookingEngine.availability({ dayKey: DAY, treatmentIds: ['bt-ceragem'] }).slots.map((s) => s.startsAt);
    expect(slots).not.toContain(at(DAY, '09:00'));
    expect(slots).toContain(at(DAY, '09:45'));

    const soon = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(
      errorOf(() => mockBookingEngine.createStaffBooking({ guestId: 'guest-2', treatmentIds: ['bt-flabelos'], startsAt: soon })),
    ).toMatchObject({ code: 'BOOKING.TOO_LATE' });
    expect(
      mockBookingEngine.createStaffBooking({ guestId: 'guest-2', treatmentIds: ['bt-flabelos'], startsAt: soon, overrideRules: true })
        .bookings[0].startsAt,
    ).toBe(soon);
  });

  it('megérkezés: pontosan egy levonás a bérletről, ismétlésre sem kettő; visszaállítás sztornóz', () => {
    const remaining = () =>
      mockStudioEngine.getGuestPasses('guest-1').find((p) => p.passTemplateName === '10 Alkalmas Hypoxi Bérlet')!
        .calculatedRemainingPasses;
    const before = remaining()!;

    const first = mockBookingEngine.setStatus('bk-demo-1', { status: BookingStatus.ARRIVED });
    expect(first.deduction).toBe('DEDUCTED');
    expect(first.booking.deducted).toBe(true);
    expect(remaining()).toBe(before - 1);

    expect(mockBookingEngine.setStatus('bk-demo-1', { status: BookingStatus.ARRIVED }).deduction).toBe('ALREADY_DEDUCTED');
    expect(mockBookingEngine.setStatus('bk-demo-1', { status: BookingStatus.NO_SHOW }).deduction).toBe('ALREADY_DEDUCTED');
    expect(remaining()).toBe(before - 1);

    expect(mockBookingEngine.setStatus('bk-demo-1', { status: BookingStatus.CONFIRMED }).deduction).toBe('REVERSED');
    expect(remaining()).toBe(before);
  });

  it('„Nem jelent meg” bérlet nélkül: nincs levonás, az állapot rögzül', () => {
    const result = mockBookingEngine.setStatus('bk-demo-2', { status: BookingStatus.NO_SHOW });
    expect(result.deduction).toBe('NO_USABLE_PASS');
    expect(result.booking.status).toBe(BookingStatus.NO_SHOW);
  });

  it('részleges lemondás: a csoport többi tétele megmarad', () => {
    const created = mockBookingEngine.createStaffBooking({
      guestId: 'guest-2',
      treatmentIds: ['bt-ceragem', 'bt-hypoxi'],
      startsAt: at(FAR_DAY, '10:00'),
    });
    expect(created.bookings.map((b) => b.treatmentId)).toEqual(['bt-hypoxi', 'bt-ceragem']);
    mockBookingEngine.cancel(created.bookings[0].id, {});
    const calendar = mockBookingEngine.calendar(FAR_DAY, FAR_DAY);
    expect(calendar.bookings.map((b) => b.id)).toEqual([created.bookings[1].id]);
  });

  it('nyilvános foglalás belépés nélkül: a meglévő profilhoz kapcsol, bérletadat nélkül', () => {
    const guests = mockStudioEngine.getGuests().length;
    const result = mockBookingEngine.publicCreate({
      treatmentIds: ['bt-flabelos'],
      startsAt: at(FAR_DAY, '09:00'),
      contact,
      privacyAccepted: true,
    });
    expect(mockStudioEngine.getGuests()).toHaveLength(guests);
    expect(result.passWarnings).toEqual([]);
    expect(mockBookingEngine.getManaged(result.bookings[0].manageToken).guestFirstName).toBe('Anna');

    expect(
      errorOf(() =>
        mockBookingEngine.publicCreate({ treatmentIds: ['bt-flabelos'], startsAt: at(FAR_DAY, '11:00'), contact, privacyAccepted: false }),
      ),
    ).toMatchObject({ code: 'BOOKING.PRIVACY_REQUIRED' });
  });

  it('kezelőlink: 24 órán belül online nem mondható le, azon kívül igen', () => {
    const create = (startsAt: string) =>
      mockBookingEngine.publicCreate({ treatmentIds: ['bt-flabelos'], startsAt, contact, privacyAccepted: true }).bookings[0];
    const soon = create(at(DAY, '09:00'));
    const far = create(at(FAR_DAY, '09:00'));
    expect(errorOf(() => mockBookingEngine.cancelManaged(soon.manageToken))).toMatchObject({ code: 'BOOKING.CHANGE_CUTOFF' });
    expect(mockBookingEngine.cancelManaged(far.manageToken).status).toBe(BookingStatus.CANCELLED);
    expect(errorOf(() => mockBookingEngine.getManaged('nincs-ilyen'))).toMatchObject({ code: 'BOOKING.LINK_INVALID' });
  });

  it('vendégkód: ismert címre demókód, hibás kód elutasítva, belépve a profil a foglalásokkal', () => {
    expect(mockBookingEngine.requestGuestCode('senki@example.com').demoCode).toBeUndefined();
    const { demoCode } = mockBookingEngine.requestGuestCode(contact.email);
    expect(demoCode).toBe('123456');
    expect(errorOf(() => mockBookingEngine.verifyGuestCode(contact.email, '000000'))).toMatchObject({
      code: 'BOOKING.GUEST_CODE_INVALID',
    });
    const login = mockBookingEngine.verifyGuestCode(contact.email, demoCode!);
    expect(login.profile.firstName).toBe('Anna');
    expect(login.profile.bookings.length).toBeGreaterThan(0);
    expect(login.profile.passes.some((p) => p.name === '10 Alkalmas Hypoxi Bérlet')).toBe(true);
    expect(errorOf(() => mockBookingEngine.guestProfile('hamis'))).toMatchObject({ code: 'BOOKING.GUEST_SESSION_INVALID' });
  });

  it('várólista: a legrégebbi várakozó kap ajánlatot és 30 perces tartást, lejáratkor a következő', () => {
    mockBookingEngine.createStaffBooking({ guestId: 'guest-3', treatmentIds: ['bt-ceragem'], startsAt: at(DAY, '09:00') });
    const join = (guestId: string) =>
      mockBookingEngine.joinWaitlistStaff({ guestId, treatmentId: 'bt-ceragem', dayKey: DAY, fromTime: '09:00', toTime: '10:00' });
    join('guest-1');
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    join('guest-2');

    const byGuest = () => new Map(mockBookingEngine.listWaitlist().map((w) => [w.guestId, w]));
    expect(byGuest().get('guest-1')).toMatchObject({ status: WaitlistStatus.OFFERED, offerStartsAt: at(DAY, '09:45') });
    expect(byGuest().get('guest-2')?.status).toBe(WaitlistStatus.WAITING);
    // A tartás beszámít a kapacitásba.
    expect(
      mockBookingEngine.availability({ dayKey: DAY, treatmentIds: ['bt-ceragem'] }).slots.map((s) => s.startsAt),
    ).not.toContain(at(DAY, '09:45'));

    vi.setSystemTime(new Date(NOW.getTime() + 32 * 60_000));
    const after = byGuest();
    expect(after.has('guest-1')).toBe(false);
    expect(after.get('guest-2')).toMatchObject({ status: WaitlistStatus.OFFERED, offerStartsAt: at(DAY, '09:45') });

    const token = mockBookingEngine.offerTokenFor(after.get('guest-2')!.id)!;
    const accepted = mockBookingEngine.acceptWaitlistOffer(token);
    expect(accepted.booking.startsAt).toBe(at(DAY, '09:45'));
  });

  it('a rendkívüli zárvatartás csak listázza az érintetteket', () => {
    const booked = mockBookingEngine.createStaffBooking({
      guestId: 'guest-1',
      treatmentIds: ['bt-flabelos'],
      startsAt: at(DAY, '09:00'),
    }).bookings[0];
    const result = mockBookingEngine.createClosure({ startsAt: at(DAY, '08:00'), endsAt: at(DAY, '10:00'), reason: 'Karbantartás' });
    expect(result.affectedBookings.map((b) => b.id)).toEqual([booked.id]);
    expect(mockBookingEngine.calendar(DAY, DAY).bookings.find((b) => b.id === booked.id)?.status).toBe(BookingStatus.CONFIRMED);
  });
});
