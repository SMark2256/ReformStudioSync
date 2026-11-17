import {
  BookingPassInput,
  bookingPassWarning,
  bookingsAffectedByClosure,
  bookingTransition,
  BookingContext,
  BookingResourceRule,
  BookableTreatmentRule,
  checkBookingWindow,
  checkChangeWindow,
  checkPlacement,
  DEFAULT_BOOKING_SETTINGS,
  easterSunday,
  findSequenceSlots,
  hungarianHolidayName,
  hungarianPublicHolidays,
  OccupancyItem,
  orderTreatments,
  PassType,
  peakConcurrency,
  pickBookingPass,
  planItem,
  planSequence,
  resolveDayHours,
  studioDateTime,
  studioMinutesOfDay,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

/**
 * TICKET-57: a foglalási szabályok tiszta függvényei (`@reform/shared/booking-rules`), a
 * stúdió időzónájában (Europe/Budapest), a nyári időszámítással együtt.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const RESOURCES: BookingResourceRule[] = [
  { id: 'r-hypoxi', capacity: 3, isActive: true },
  { id: 'r-nyirok', capacity: 2, isActive: true },
  { id: 'r-hiemt', capacity: 1, isActive: true },
  { id: 'r-ceragem', capacity: 1, isActive: true },
  { id: 'r-flabelos', capacity: 1, isActive: true },
];
const RESOURCE = new Map(RESOURCES.map((r) => [r.id, r]));

const T = {
  hypoxi: { id: 't-hypoxi', resourceId: 'r-hypoxi', durationMinutes: 30, bufferMinutes: 5, sortOrder: 1 },
  nyirok: { id: 't-nyirok', resourceId: 'r-nyirok', durationMinutes: 30, bufferMinutes: 5, sortOrder: 2 },
  hiemt: { id: 't-hiemt', resourceId: 'r-hiemt', durationMinutes: 30, bufferMinutes: 5, sortOrder: 3 },
  intimpad: { id: 't-intimpad', resourceId: 'r-hiemt', durationMinutes: 30, bufferMinutes: 5, sortOrder: 4 },
  ceragem: { id: 't-ceragem', resourceId: 'r-ceragem', durationMinutes: 40, bufferMinutes: 5, sortOrder: 5 },
  flabelos: { id: 't-flabelos', resourceId: 'r-flabelos', durationMinutes: 10, bufferMinutes: 5, sortOrder: 6 },
} satisfies Record<string, BookableTreatmentRule>;

/** 2026-11-17, kedd, 11:00 Budapest (téli idő, UTC+1). */
const NOW = new Date('2026-11-17T10:00:00.000Z');
const DAY = '2026-11-18'; // szerda

const at = (dayKey: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return studioDateTime(dayKey, h * 60 + m);
};

function ctx(partial: Partial<BookingContext> = {}): BookingContext {
  return {
    settings: DEFAULT_BOOKING_SETTINGS,
    overrides: [],
    closures: [],
    occupancy: [],
    guestBusy: [],
    ...partial,
  };
}

function occupied(treatment: BookableTreatmentRule, startsAt: Date, refId: string): OccupancyItem {
  const item = planItem(treatment, startsAt);
  return { refId, resourceId: item.resourceId, startsAt: item.startsAt, blockedUntil: item.blockedUntil };
}

describe('magyar munkaszüneti napok', () => {
  it('húsvét 2026-ban és 2027-ben', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('a húsvétfüggő napok: nagypéntek, húsvét- és pünkösdhétfő (2026)', () => {
    expect(hungarianHolidayName('2026-04-03')).toBe('Nagypéntek');
    expect(hungarianHolidayName('2026-04-06')).toBe('Húsvéthétfő');
    expect(hungarianHolidayName('2026-05-24')).toBe('Pünkösdvasárnap');
    expect(hungarianHolidayName('2026-05-25')).toBe('Pünkösdhétfő');
  });

  it('a húsvétfüggő napok 2027-ben', () => {
    expect(hungarianHolidayName('2027-03-26')).toBe('Nagypéntek');
    expect(hungarianHolidayName('2027-03-29')).toBe('Húsvéthétfő');
    expect(hungarianHolidayName('2027-05-17')).toBe('Pünkösdhétfő');
  });

  it('a fix ünnepek, a szenteste is', () => {
    const days = hungarianPublicHolidays(2026).map((h) => h.dayKey);
    for (const day of ['2026-01-01', '2026-03-15', '2026-05-01', '2026-08-20', '2026-10-23', '2026-11-01', '2026-12-24', '2026-12-25', '2026-12-26']) {
      expect(days).toContain(day);
    }
    expect(hungarianHolidayName('2026-11-18')).toBeNull();
  });

  it('ünnepnapon zárva, a recepciós felülírással nyitva; egy hétköznap felülírással zárva', () => {
    expect(resolveDayHours('2026-04-06', DEFAULT_BOOKING_SETTINGS)).toMatchObject({
      hours: null,
      closedReason: 'HOLIDAY',
      holidayName: 'Húsvéthétfő',
    });
    expect(
      resolveDayHours('2026-04-06', DEFAULT_BOOKING_SETTINGS, [{ dayKey: '2026-04-06', isOpen: true }]),
    ).toMatchObject({ hours: { opensAt: 420, closesAt: 1080 }, closedReason: null, overridden: true });
    expect(
      resolveDayHours(DAY, DEFAULT_BOOKING_SETTINGS, [{ dayKey: DAY, isOpen: false }]),
    ).toMatchObject({ hours: null, closedReason: 'OVERRIDE_CLOSED' });
  });

  it('hétvégén zárva, hétköznap 07:00–18:00', () => {
    expect(resolveDayHours('2026-11-21', DEFAULT_BOOKING_SETTINGS).closedReason).toBe('WEEKLY_CLOSED');
    expect(resolveDayHours(DAY, DEFAULT_BOOKING_SETTINGS).hours).toEqual({ opensAt: 420, closesAt: 1080 });
  });
});

describe('nyitvatartás a szünettel és a nyári időszámítás', () => {
  it('a kezelés a szünettel együtt férjen bele: Hypoxi 17:25 még igen, 17:30 már nem', () => {
    expect(checkPlacement(planItem(T.hypoxi, at(DAY, '17:25')), RESOURCE.get('r-hypoxi')!, ctx())).toBeNull();
    expect(checkPlacement(planItem(T.hypoxi, at(DAY, '17:30')), RESOURCE.get('r-hypoxi')!, ctx())).toBe(
      'OUTSIDE_OPENING_HOURS',
    );
    expect(checkPlacement(planItem(T.hypoxi, at(DAY, '06:45')), RESOURCE.get('r-hypoxi')!, ctx())).toBe(
      'OUTSIDE_OPENING_HOURS',
    );
  });

  it('a helyi 07:00 télen 06:00 UTC, nyáron 05:00 UTC', () => {
    expect(studioDateTime('2026-11-18', 420).toISOString()).toBe('2026-11-18T06:00:00.000Z');
    expect(studioDateTime('2026-07-15', 420).toISOString()).toBe('2026-07-15T05:00:00.000Z');
  });

  it('az óraátállítás napján (2026-03-29, 2026-10-25) helyes a helyi idő', () => {
    const open = (dayKey: string) => [{ dayKey, isOpen: true }];
    const spring = findSequenceSlots({
      dayKey: '2026-03-29',
      treatments: [T.flabelos],
      resources: RESOURCES,
      ctx: ctx({ overrides: open('2026-03-29') }),
      now: new Date('2026-03-20T10:00:00.000Z'),
    });
    expect(spring[0].startsAt.toISOString()).toBe('2026-03-29T05:00:00.000Z');
    expect(spring.every((s) => studioMinutesOfDay(s.startsAt) >= 420)).toBe(true);

    const autumn = findSequenceSlots({
      dayKey: '2026-10-25',
      treatments: [T.flabelos],
      resources: RESOURCES,
      ctx: ctx({ overrides: open('2026-10-25') }),
      now: new Date('2026-10-20T10:00:00.000Z'),
    });
    expect(autumn[0].startsAt.toISOString()).toBe('2026-10-25T06:00:00.000Z');
    // 07:00-tól 17:45-ig 15 percenként (a 10 perc + 5 perc szünet 18:00-ig fér bele).
    expect(autumn).toHaveLength(44);
  });

  it('a nyári időszámítás utáni hétfőn 07:00 = 05:00 UTC', () => {
    const slots = findSequenceSlots({
      dayKey: '2026-03-30',
      treatments: [T.hypoxi],
      resources: RESOURCES,
      ctx: ctx(),
      now: new Date('2026-03-27T10:00:00.000Z'),
    });
    expect(slots[0].startsAt.toISOString()).toBe('2026-03-30T05:00:00.000Z');
  });
});

describe('foglalási időablak: 30 nap / 30 perc / 24 óra', () => {
  const s = DEFAULT_BOOKING_SETTINGS;

  it('legalább 30 perccel előtte', () => {
    expect(checkBookingWindow(new Date(NOW.getTime() + 29 * MINUTE), NOW, s)).toBe('TOO_LATE');
    expect(checkBookingWindow(new Date(NOW.getTime() + 30 * MINUTE), NOW, s)).toBeNull();
    expect(checkBookingWindow(new Date(NOW.getTime() - MINUTE), NOW, s)).toBe('IN_PAST');
  });

  it('legfeljebb 30 nappal előre (naptári nap szerint)', () => {
    expect(checkBookingWindow(at('2026-12-17', '17:00'), NOW, s)).toBeNull();
    expect(checkBookingWindow(at('2026-12-18', '07:00'), NOW, s)).toBe('TOO_FAR');
  });

  it('a recepció mindhármat felülírja', () => {
    expect(checkBookingWindow(new Date(NOW.getTime() + MINUTE), NOW, s, true)).toBeNull();
    expect(checkBookingWindow(at('2027-02-01', '09:00'), NOW, s, true)).toBeNull();
    expect(checkBookingWindow(new Date(NOW.getTime() - HOUR), NOW, s, true)).toBeNull();
  });

  it('online módosítás és lemondás legalább 24 órával előtte, felülírással bármikor', () => {
    expect(checkChangeWindow(new Date(NOW.getTime() + 24 * HOUR), NOW, s)).toBeNull();
    expect(checkChangeWindow(new Date(NOW.getTime() + 24 * HOUR - 1), NOW, s)).toBe('CHANGE_CUTOFF');
    expect(checkChangeWindow(new Date(NOW.getTime() + HOUR), NOW, s, true)).toBeNull();
  });

  it('a szabad időpontok közül kimarad, ami 30 percen belül van, a recepciónak nem', () => {
    const today = '2026-11-17';
    const online = findSequenceSlots({ dayKey: today, treatments: [T.hypoxi], resources: RESOURCES, ctx: ctx(), now: NOW });
    expect(online[0].startsAt.toISOString()).toBe(at(today, '11:30').toISOString());
    const staff = findSequenceSlots({
      dayKey: today,
      treatments: [T.hypoxi],
      resources: RESOURCES,
      ctx: ctx(),
      now: NOW,
      override: true,
    });
    expect(staff[0].startsAt.toISOString()).toBe(at(today, '07:00').toISOString());
  });
});

describe('kapacitás és közös erőforrás', () => {
  it('Hypoxi: 3 fő fér el egyszerre, a negyedik nem', () => {
    const start = at(DAY, '09:00');
    const two = [occupied(T.hypoxi, start, 'a'), occupied(T.hypoxi, start, 'b')];
    const three = [...two, occupied(T.hypoxi, start, 'c')];
    const item = planItem(T.hypoxi, start);
    expect(checkPlacement(item, RESOURCE.get('r-hypoxi')!, ctx({ occupancy: two }))).toBeNull();
    expect(checkPlacement(item, RESOURCE.get('r-hypoxi')!, ctx({ occupancy: three }))).toBe('CAPACITY_FULL');
  });

  it('HIEMT és Intimpad közös, 1 fős gép: a szünet is foglaltság', () => {
    const occupancy = [occupied(T.hiemt, at(DAY, '09:00'), 'hiemt')];
    const resource = RESOURCE.get('r-hiemt')!;
    expect(checkPlacement(planItem(T.intimpad, at(DAY, '09:30')), resource, ctx({ occupancy }))).toBe('CAPACITY_FULL');
    expect(checkPlacement(planItem(T.intimpad, at(DAY, '09:35')), resource, ctx({ occupancy }))).toBeNull();
    expect(checkPlacement(planItem(T.intimpad, at(DAY, '08:25')), resource, ctx({ occupancy }))).toBeNull();
    expect(checkPlacement(planItem(T.intimpad, at(DAY, '08:30')), resource, ctx({ occupancy }))).toBe('CAPACITY_FULL');
  });

  it('az egymás után következő tételek nem adódnak össze a csúcsban', () => {
    const items = [occupied(T.hypoxi, at(DAY, '09:00'), 'a'), occupied(T.hypoxi, at(DAY, '09:35'), 'b')];
    expect(peakConcurrency(items, 'r-hypoxi', at(DAY, '09:00'), at(DAY, '10:10'))).toBe(1);
    expect(peakConcurrency(items, 'r-hypoxi', at(DAY, '09:00'), at(DAY, '10:10'), ['a', 'b'])).toBe(0);
  });

  it('a szabad időpontok a közös gépen kihagyják a foglalt sávot', () => {
    const slots = findSequenceSlots({
      dayKey: DAY,
      treatments: [T.intimpad],
      resources: RESOURCES,
      ctx: ctx({ occupancy: [occupied(T.hiemt, at(DAY, '09:00'), 'hiemt')] }),
      now: NOW,
    }).map((s) => studioMinutesOfDay(s.startsAt));
    const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    expect(slots).toContain(min('08:15'));
    for (const blocked of ['08:30', '08:45', '09:00', '09:15', '09:30']) {
      expect(slots).not.toContain(min(blocked));
    }
    expect(slots).toContain(min('09:45'));
  });

  it('a szabad helyek száma a csúcs után', () => {
    const slots = findSequenceSlots({
      dayKey: DAY,
      treatments: [T.hypoxi],
      resources: RESOURCES,
      ctx: ctx({ occupancy: [occupied(T.hypoxi, at(DAY, '09:00'), 'a')] }),
      now: NOW,
    });
    expect(slots.find((s) => s.startsAt.getTime() === at(DAY, '09:00').getTime())?.remaining).toBe(2);
    expect(slots.find((s) => s.startsAt.getTime() === at(DAY, '12:00').getTime())?.remaining).toBe(3);
  });

  it('a vendég önátfedése tiltott (a szünet a vendéget nem köti)', () => {
    const guestBusy = [{ refId: 'own', startsAt: at(DAY, '09:00'), endsAt: at(DAY, '09:30') }];
    const resource = RESOURCE.get('r-ceragem')!;
    expect(checkPlacement(planItem(T.ceragem, at(DAY, '09:15')), resource, ctx({ guestBusy }))).toBe('GUEST_OVERLAP');
    expect(checkPlacement(planItem(T.ceragem, at(DAY, '09:30')), resource, ctx({ guestBusy }))).toBeNull();
    // Áthelyezésnél a saját foglalás nem ütközik.
    expect(checkPlacement(planItem(T.ceragem, at(DAY, '09:15')), resource, ctx({ guestBusy }), ['own'])).toBeNull();
  });

  it('zárvatartás és gépletiltás', () => {
    const closures = [
      { startsAt: at(DAY, '12:00'), endsAt: at(DAY, '13:00'), resourceId: null },
      { startsAt: at(DAY, '15:00'), endsAt: at(DAY, '16:00'), resourceId: 'r-ceragem' },
    ];
    const resource = RESOURCE.get('r-ceragem')!;
    expect(checkPlacement(planItem(T.ceragem, at(DAY, '11:30')), resource, ctx({ closures }))).toBe('CLOSED');
    expect(checkPlacement(planItem(T.ceragem, at(DAY, '15:30')), resource, ctx({ closures }))).toBe('RESOURCE_BLOCKED');
    expect(
      checkPlacement(planItem(T.hypoxi, at(DAY, '15:30')), RESOURCE.get('r-hypoxi')!, ctx({ closures })),
    ).toBeNull();
    expect(
      checkPlacement(planItem(T.ceragem, at(DAY, '09:00')), { ...resource, isActive: false }, ctx()),
    ).toBe('RESOURCE_BLOCKED');
  });

  it('a zárvatartás csak listázza az érintett foglalásokat', () => {
    const bookings = [
      { id: 'a', resourceId: 'r-hypoxi', startsAt: at(DAY, '09:00'), blockedUntil: at(DAY, '09:35'), status: 'CONFIRMED' },
      { id: 'b', resourceId: 'r-hypoxi', startsAt: at(DAY, '09:00'), blockedUntil: at(DAY, '09:35'), status: 'CANCELLED' },
      { id: 'c', resourceId: 'r-ceragem', startsAt: at(DAY, '14:00'), blockedUntil: at(DAY, '14:45'), status: 'CONFIRMED' },
    ];
    const affected = bookingsAffectedByClosure(bookings, {
      startsAt: at(DAY, '08:00'),
      endsAt: at(DAY, '10:00'),
      resourceId: null,
    });
    expect(affected.map((b) => b.id)).toEqual(['a']);
  });
});

describe('többkezeléses foglalás sorrendje', () => {
  it('a konfigurált sorrend számít, nem a választás sorrendje', () => {
    expect(orderTreatments([T.flabelos, T.hypoxi, T.ceragem]).map((t) => t.id)).toEqual([
      't-hypoxi',
      't-ceragem',
      't-flabelos',
    ]);
  });

  it('egymást követő időpontok; ugyanazon a gépen a szünet után', () => {
    const plan = planSequence(orderTreatments([T.ceragem, T.hypoxi]), at(DAY, '09:00'));
    expect(plan.map((p) => [p.treatmentId, studioMinutesOfDay(p.startsAt), studioMinutesOfDay(p.endsAt)])).toEqual([
      ['t-hypoxi', 540, 570],
      ['t-ceragem', 570, 610],
    ]);

    const shared = planSequence(orderTreatments([T.intimpad, T.hiemt]), at(DAY, '09:00'));
    expect(shared.map((p) => [p.treatmentId, studioMinutesOfDay(p.startsAt)])).toEqual([
      ['t-hiemt', 540],
      ['t-intimpad', 575],
    ]);
  });

  it('csak az az időpont jelenik meg, ahol minden kezelés elfér', () => {
    // A Ceragem 09:30–10:10 foglalt, így a 09:00-s Hypoxi + Ceragem sor nem fér el.
    const slots = findSequenceSlots({
      dayKey: DAY,
      treatments: [T.ceragem, T.hypoxi],
      resources: RESOURCES,
      ctx: ctx({ occupancy: [occupied(T.ceragem, at(DAY, '09:30'), 'busy')] }),
      now: NOW,
    });
    const starts = slots.map((s) => studioMinutesOfDay(s.startsAt));
    expect(starts).not.toContain(540);
    expect(starts).toContain(480);
    const first = slots[0];
    expect(first.items.map((i) => i.treatmentId)).toEqual(['t-hypoxi', 't-ceragem']);
    expect(first.endsAt.getTime()).toBe(first.items[1].endsAt.getTime());
  });

  it('a szünet is beleszámít a zárás előtti utolsó időpontba', () => {
    const slots = findSequenceSlots({
      dayKey: DAY,
      treatments: [T.hypoxi, T.flabelos],
      resources: RESOURCES,
      ctx: ctx(),
      now: NOW,
    });
    // Hypoxi 30 perc, utána Flabelos 10 + 5 perc: 17:15-ös kezdés 18:00-kor ér véget.
    expect(studioMinutesOfDay(slots[slots.length - 1].startsAt)).toBe(17 * 60 + 15);
  });
});

describe('állapotváltás és bérlet', () => {
  it('megérkezés és „Nem jelent meg” levonással, visszaállítás visszavonással', () => {
    expect(bookingTransition('CONFIRMED', 'ARRIVED')).toEqual({ allowed: true, deduct: true, reverse: false });
    expect(bookingTransition('LATE', 'NO_SHOW')).toEqual({ allowed: true, deduct: true, reverse: false });
    expect(bookingTransition('ARRIVED', 'CONFIRMED')).toEqual({ allowed: true, deduct: false, reverse: true });
    expect(bookingTransition('CONFIRMED', 'LATE')).toEqual({ allowed: true, deduct: false, reverse: false });
  });

  it('lemondott foglalás végleges; megtörtént foglalás nem mondható le', () => {
    expect(bookingTransition('CANCELLED', 'CONFIRMED').allowed).toBe(false);
    expect(bookingTransition('ARRIVED', 'CANCELLED').allowed).toBe(false);
    expect(bookingTransition('CONFIRMED', 'CANCELLED').allowed).toBe(true);
  });

  const pass = (over: Partial<BookingPassInput> = {}): BookingPassInput => ({
    id: 'p1',
    type: PassType.OCCASION_BASED,
    remainingPasses: 5,
    startDate: '2026-11-01T00:00:00.000Z',
    expirationDate: '2026-12-31T00:00:00.000Z',
    isFrozen: false,
    cancelledAt: null,
    serviceId: 'svc-hypoxi',
    womenOnly: false,
    ...over,
  });

  it('figyelmeztetés: hiányzó, lejárt, 0 alkalmas, fagyasztott bérlet, kevés alkalom', () => {
    expect(bookingPassWarning([], 'svc-hypoxi', 1, NOW)).toBe('NO_PASS');
    expect(bookingPassWarning([pass({ serviceId: 'svc-other' })], 'svc-hypoxi', 1, NOW)).toBe('NO_PASS');
    expect(bookingPassWarning([pass({ expirationDate: '2026-11-10T00:00:00.000Z' })], 'svc-hypoxi', 1, NOW)).toBe(
      'EXPIRED_PASS',
    );
    expect(bookingPassWarning([pass({ remainingPasses: 0 })], 'svc-hypoxi', 1, NOW)).toBe('DEPLETED_PASS');
    expect(bookingPassWarning([pass({ isFrozen: true })], 'svc-hypoxi', 1, NOW)).toBe('FROZEN_PASS');
    expect(bookingPassWarning([pass({ remainingPasses: 1 })], 'svc-hypoxi', 2, NOW)).toBe('NOT_ENOUGH_OCCASIONS');
    expect(bookingPassWarning([pass({ remainingPasses: 2 })], 'svc-hypoxi', 2, NOW)).toBeNull();
    expect(bookingPassWarning([pass({ type: PassType.TIME_BASED, remainingPasses: null })], 'svc-hypoxi', 9, NOW)).toBeNull();
  });

  it('levonáshoz csak aktív, a kezelésre szóló bérlet; a kötött előbb, majd a hamarabb lejáró', () => {
    const general = pass({ id: 'general', serviceId: null, expirationDate: '2026-11-20T00:00:00.000Z' });
    const bound = pass({ id: 'bound', expirationDate: '2026-12-20T00:00:00.000Z' });
    const boundSoon = pass({ id: 'bound-soon', expirationDate: '2026-12-01T00:00:00.000Z' });
    expect(pickBookingPass([general, bound, boundSoon], 'svc-hypoxi', NOW)?.id).toBe('bound-soon');
    expect(pickBookingPass([general], 'svc-hypoxi', NOW)?.id).toBe('general');
    expect(pickBookingPass([pass({ remainingPasses: 0 })], 'svc-hypoxi', NOW)).toBeNull();
    expect(pickBookingPass([pass({ expirationDate: '2026-11-01T00:00:00.000Z' })], 'svc-hypoxi', NOW)).toBeNull();
  });
});
