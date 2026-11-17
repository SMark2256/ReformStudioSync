import {
  automationDays,
  automationDedupeKey,
  birthMonthDay,
  EmailAutomationKind,
  EmailCategory,
  emailCategoryFor,
  emailRetryDelayMs,
  isAnniversaryOn,
  marketingExclusion,
  matchesAudienceFilter,
  parseNameDay,
  studioDayRange,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

const day = (year: number, month: number, d: number) => ({ year, month, day: d });

describe('Születés- és névnap kiválasztása (TICKET-55)', () => {
  it('a születési dátum hónap-napja a tárolt formából, időzóna-váltás nélkül', () => {
    expect(birthMonthDay(new Date('1990-07-26T00:00:00.000Z'))).toEqual({ month: 7, day: 26 });
    expect(birthMonthDay('1990-01-01')).toEqual({ month: 1, day: 1 });
    expect(birthMonthDay(null)).toBeNull();
  });

  it('a névnap csak MM-DD alakban, létező nappal érvényes', () => {
    expect(parseNameDay('07-26')).toEqual({ month: 7, day: 26 });
    expect(parseNameDay(' 02-29 ')).toEqual({ month: 2, day: 29 });
    expect(parseNameDay('7-26')).toBeNull();
    expect(parseNameDay('13-01')).toBeNull();
    expect(parseNameDay('02-30')).toBeNull();
    expect(parseNameDay(null)).toBeNull();
  });

  it('szökőnap: nem szökőévben február 28-án, szökőévben február 29-én', () => {
    const leapling = birthMonthDay('2000-02-29');
    expect(isAnniversaryOn(leapling, day(2027, 2, 28))).toBe(true);
    expect(isAnniversaryOn(leapling, day(2027, 3, 1))).toBe(false);
    expect(isAnniversaryOn(leapling, day(2028, 2, 29))).toBe(true);
    expect(isAnniversaryOn(leapling, day(2028, 2, 28))).toBe(false);
    expect(isAnniversaryOn(parseNameDay('02-29'), day(2026, 2, 28))).toBe(true);
    expect(isAnniversaryOn(null, day(2026, 2, 28))).toBe(false);
  });

  it('a nap a budapesti naptár szerint, 8 óra előtt a mai nap még nem megy', () => {
    const enabledAt = '2026-01-01T00:00:00.000Z';
    // 2026-03-10 00:30 Budapesten (UTC+1): a mai nap még nincs, a két előző pótlásként igen.
    expect(automationDays(new Date('2026-03-09T23:30:00.000Z'), enabledAt)).toEqual([
      day(2026, 3, 8),
      day(2026, 3, 9),
    ]);
    // 08:30 Budapesten: a mai nap is.
    expect(automationDays(new Date('2026-03-10T07:30:00.000Z'), enabledAt)).toEqual([
      day(2026, 3, 8),
      day(2026, 3, 9),
      day(2026, 3, 10),
    ]);
    // Nyári idő (UTC+2): 2026-07-26 09:00 Budapesten = 07:00 UTC, már július 26.
    expect(automationDays(new Date('2026-07-26T07:00:00.000Z'), enabledAt).at(-1)).toEqual(
      day(2026, 7, 26),
    );
  });

  it('a pótlás nem megy a bekapcsolás napja elé, kikapcsolva (nincs időpont) semmi', () => {
    const now = new Date('2026-03-10T09:00:00.000Z');
    expect(automationDays(now, '2026-03-10T06:00:00.000Z')).toEqual([day(2026, 3, 10)]);
    expect(automationDays(now, '2026-03-09T12:00:00.000Z')).toEqual([day(2026, 3, 9), day(2026, 3, 10)]);
    expect(automationDays(now, null)).toEqual([]);
  });

  it('a dupla küldést kizáró kulcs: vendég + automatizmus (+ az évforduló éve)', () => {
    expect(automationDedupeKey(EmailAutomationKind.WELCOME, 'g1')).toBe('WELCOME:g1');
    expect(automationDedupeKey(EmailAutomationKind.BIRTHDAY, 'g1', day(2026, 12, 31))).toBe(
      'BIRTHDAY:g1:2026',
    );
    // Évfordulón át pótolt (dec. 31.) köszöntő a tavalyi év kulcsát kapja, nem az ideit.
    const days = automationDays(new Date('2027-01-01T10:00:00.000Z'), '2026-12-01T00:00:00.000Z');
    const occurrence = days.find((d) => isAnniversaryOn(birthMonthDay('1990-12-31'), d));
    expect(automationDedupeKey(EmailAutomationKind.BIRTHDAY, 'g1', occurrence)).toBe('BIRTHDAY:g1:2026');
  });
});

describe('Hozzájárulás és kategória (TICKET-55)', () => {
  it('az üdvözlő és az egyéni levél tranzakciós, a köszöntő és a csoportos marketing', () => {
    expect(emailCategoryFor('WELCOME')).toBe(EmailCategory.TRANSACTIONAL);
    expect(emailCategoryFor('MANUAL')).toBe(EmailCategory.TRANSACTIONAL);
    expect(emailCategoryFor('TEST')).toBe(EmailCategory.TRANSACTIONAL);
    expect(emailCategoryFor('BIRTHDAY')).toBe(EmailCategory.MARKETING);
    expect(emailCategoryFor('NAME_DAY')).toBe(EmailCategory.MARKETING);
    expect(emailCategoryFor('BULK')).toBe(EmailCategory.MARKETING);
  });

  it('marketing levél csak címmel, hozzájárulással és leiratkozás nélkül', () => {
    expect(marketingExclusion({ email: 'a@b.hu', marketingConsent: true, unsubscribedAt: null })).toBeNull();
    expect(marketingExclusion({ email: null, marketingConsent: true })).toBe('NO_EMAIL');
    expect(marketingExclusion({ email: '  ', marketingConsent: true })).toBe('NO_EMAIL');
    expect(marketingExclusion({ email: 'a@b.hu', marketingConsent: false })).toBe('NO_CONSENT');
    expect(
      marketingExclusion({ email: 'a@b.hu', marketingConsent: true, unsubscribedAt: new Date() }),
    ).toBe('NO_CONSENT');
  });
});

describe('Csoportos küldés szűrője (TICKET-55)', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');
  const current = { serviceId: 'srv-hypoxi', current: true };
  const lapsed = { serviceId: 'srv-reformer', current: false };

  it('bérletállapot: érvényes, lejárt, soha nem volt', () => {
    const withCurrent = { entitlements: [current], lastVisitAt: null };
    const withLapsed = { entitlements: [lapsed], lastVisitAt: null };
    const never = { entitlements: [], lastVisitAt: null };

    expect(matchesAudienceFilter(withCurrent, { passState: 'CURRENT' }, now)).toBe(true);
    expect(matchesAudienceFilter(withLapsed, { passState: 'CURRENT' }, now)).toBe(false);
    expect(matchesAudienceFilter(withLapsed, { passState: 'LAPSED' }, now)).toBe(true);
    expect(matchesAudienceFilter({ entitlements: [current, lapsed], lastVisitAt: null }, { passState: 'LAPSED' }, now)).toBe(false);
    expect(matchesAudienceFilter(never, { passState: 'LAPSED' }, now)).toBe(false);
    expect(matchesAudienceFilter(never, { passState: 'NEVER' }, now)).toBe(true);
    expect(matchesAudienceFilter(withCurrent, { passState: 'NEVER' }, now)).toBe(false);
    expect(matchesAudienceFilter(never, {}, now)).toBe(true);
  });

  it('szolgáltatás: az érvényes bérletnek arra kell szólnia', () => {
    const guest = { entitlements: [current, lapsed], lastVisitAt: null };
    expect(matchesAudienceFilter(guest, { serviceIds: ['srv-hypoxi'], passState: 'CURRENT' }, now)).toBe(true);
    expect(matchesAudienceFilter(guest, { serviceIds: ['srv-reformer'], passState: 'CURRENT' }, now)).toBe(false);
    expect(matchesAudienceFilter(guest, { serviceIds: ['srv-reformer'] }, now)).toBe(true);
    expect(matchesAudienceFilter(guest, { serviceIds: ['srv-masik'] }, now)).toBe(false);
    expect(
      matchesAudienceFilter({ entitlements: [lapsed], lastVisitAt: null }, { serviceIds: ['srv-reformer'], passState: 'LAPSED' }, now),
    ).toBe(true);
  });

  it('utolsó látogatás: az elmúlt N napban járt / N napja nem járt (a soha nem járt is)', () => {
    const recent = { entitlements: [], lastVisitAt: '2026-03-05T10:00:00.000Z' };
    const old = { entitlements: [], lastVisitAt: '2026-01-05T10:00:00.000Z' };
    const never = { entitlements: [], lastVisitAt: null };
    const within = { lastVisit: { mode: 'WITHIN' as const, days: 30 } };
    const notWithin = { lastVisit: { mode: 'NOT_WITHIN' as const, days: 30 } };

    expect(matchesAudienceFilter(recent, within, now)).toBe(true);
    expect(matchesAudienceFilter(old, within, now)).toBe(false);
    expect(matchesAudienceFilter(never, within, now)).toBe(false);
    expect(matchesAudienceFilter(recent, notWithin, now)).toBe(false);
    expect(matchesAudienceFilter(old, notWithin, now)).toBe(true);
    expect(matchesAudienceFilter(never, notWithin, now)).toBe(true);
  });
});

describe('Kimenő sor újrapróbálása (TICKET-55)', () => {
  it('visszalépő várakozás: 5, 10, 20, 40 perc, legfeljebb 2 óra', () => {
    const minutes = [1, 2, 3, 4, 5, 6].map((n) => emailRetryDelayMs(n) / 60_000);
    expect(minutes).toEqual([5, 10, 20, 40, 80, 120]);
  });
});

describe('A napló dátumszűrője (TICKET-55)', () => {
  it('a stúdió napja szerint szűr: télen UTC+1, nyáron UTC+2, a záró nap bezárólag', () => {
    expect(studioDayRange('2026-01-10', '2026-01-10')).toEqual({
      gte: new Date('2026-01-09T23:00:00.000Z'),
      lt: new Date('2026-01-10T23:00:00.000Z'),
    });
    expect(studioDayRange('2026-07-01', undefined)).toEqual({
      gte: new Date('2026-06-30T22:00:00.000Z'),
    });
  });

  it('az óraátállítás napján és hónap végén is a következő nap elejéig tart', () => {
    // 2026. márc. 29.: 02:00-kor 03:00 lesz, a nap 23 órás.
    expect(studioDayRange(undefined, '2026-03-29')).toEqual({
      lt: new Date('2026-03-29T22:00:00.000Z'),
    });
    expect(studioDayRange(undefined, '2026-12-31').lt).toEqual(new Date('2026-12-31T23:00:00.000Z'));
  });

  it('a hibás alakú dátumot figyelmen kívül hagyja', () => {
    expect(studioDayRange('2026/01/10', 'tegnap')).toEqual({});
  });
});
