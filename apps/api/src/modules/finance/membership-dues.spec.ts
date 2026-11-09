import {
  getMembershipDueSchedule,
  getMembershipStatusTimestamps,
  getMissingDues,
  getOverdueBucket,
  getOverdueDays,
  isDueRemovableOnStop,
  MembershipStatus,
  OverdueBucket,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const periods = (input: Parameters<typeof getMembershipDueSchedule>[0], now: string) =>
  getMembershipDueSchedule(input, new Date(now)).map((s) => s.period);

describe('getMembershipDueSchedule — havi tagdíj-esedékességek (TICKET-13)', () => {
  it('a 2. és 3. hónap esedékessége is benne van, a dueDay napjával', () => {
    const schedule = getMembershipDueSchedule(
      { startDate: '2026-09-05', dueDay: 10, status: MembershipStatus.ACTIVE },
      new Date('2026-11-08T09:00:00Z'),
    );
    expect(schedule).toEqual([
      { period: '2026-09', dueDate: day('2026-09-10') },
      { period: '2026-10', dueDate: day('2026-10-10') },
      { period: '2026-11', dueDate: day('2026-11-10') },
    ]);
  });

  it('kezdés 20-án, dueDay 10: az első esedékesség a következő hónap 10-e', () => {
    const input = {
      startDate: '2026-11-20',
      dueDay: 10,
      status: MembershipStatus.ACTIVE,
    };
    expect(periods(input, '2026-11-20T10:00:00Z')).toEqual([]);
    expect(periods(input, '2026-11-30T12:00:00Z')).toEqual([]);
    expect(getMembershipDueSchedule(input, new Date('2026-12-01T08:00:00Z'))).toEqual([
      { period: '2026-12', dueDate: day('2026-12-10') },
    ]);
  });

  it('kezdés az esedékesség napján: az adott hónap esedékes', () => {
    expect(
      periods(
        { startDate: '2026-11-10', dueDay: 10, status: MembershipStatus.ACTIVE },
        '2026-11-10T08:00:00Z',
      ),
    ).toEqual(['2026-11']);
  });

  it('rövid hónapban (dueDay 31) a hónap utolsó napja az esedékesség', () => {
    const schedule = getMembershipDueSchedule(
      { startDate: '2026-01-15', dueDay: 31, status: MembershipStatus.ACTIVE },
      new Date('2026-04-02T08:00:00Z'),
    );
    expect(schedule.map((s) => s.dueDate)).toEqual([
      day('2026-01-31'),
      day('2026-02-28'),
      day('2026-03-31'),
      day('2026-04-30'),
    ]);
  });

  it('a budapesti naptár számít, nem az UTC (kezdés és „ma”)', () => {
    // 2026-11-09T23:30Z = Budapesten november 10., 00:30 → 10 > 9, így december az első
    expect(
      periods(
        { startDate: '2026-11-09T23:30:00Z', dueDay: 9, status: MembershipStatus.ACTIVE },
        '2026-11-30T23:30:00Z', // Budapesten már december 1.
      ),
    ).toEqual(['2026-12']);
  });

  it('évfordulón átível', () => {
    expect(
      periods(
        { startDate: '2026-11-25', dueDay: 10, status: MembershipStatus.ACTIVE },
        '2027-02-01T08:00:00Z',
      ),
    ).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  it('szüneteltetésnél a szünet kezdete után esedékes hónap kimarad', () => {
    const base = {
      startDate: '2026-08-01',
      dueDay: 10,
      status: MembershipStatus.PAUSED,
    };
    expect(periods({ ...base, pausedAt: '2026-10-05T12:00:00Z' }, '2026-12-15T08:00:00Z')).toEqual([
      '2026-08',
      '2026-09',
    ]);
    // A szünet az esedékesség napján indul: az aznapi díj még esedékes
    expect(periods({ ...base, pausedAt: '2026-10-10T12:00:00Z' }, '2026-12-15T08:00:00Z')).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    // Dátum nélküli szünet: nem keletkezik esedékesség
    expect(periods(base, '2026-12-15T08:00:00Z')).toEqual([]);
  });

  it('megszűnt tagságnál a megszűnés után nincs esedékesség', () => {
    expect(
      periods(
        {
          startDate: '2026-08-01',
          dueDay: 10,
          status: MembershipStatus.TERMINATED,
          terminatedAt: '2026-09-20T12:00:00Z',
        },
        '2026-12-15T08:00:00Z',
      ),
    ).toEqual(['2026-08', '2026-09']);
  });

  it('újraaktiválás után a következő esedékes hónaptól folytatódik', () => {
    const base = { startDate: '2026-08-01', dueDay: 10, status: MembershipStatus.ACTIVE };
    // Újraaktiválás 15-én (> 10) → a következő hónap az első
    expect(periods({ ...base, resumedAt: '2026-12-15T09:00:00Z' }, '2027-01-20T08:00:00Z')).toEqual([
      '2027-01',
    ]);
    // Újraaktiválás 5-én (≤ 10) → az adott hónap esedékes
    expect(periods({ ...base, resumedAt: '2026-12-05T09:00:00Z' }, '2026-12-06T08:00:00Z')).toEqual([
      '2026-12',
    ]);
  });

  it('jövőbeli kezdésnél nincs esedékesség', () => {
    expect(
      periods(
        { startDate: '2027-01-05', dueDay: 10, status: MembershipStatus.ACTIVE },
        '2026-11-08T08:00:00Z',
      ),
    ).toEqual([]);
  });
});

describe('getMissingDues — idempotens pótlás', () => {
  const now = new Date('2026-12-15T08:00:00Z');
  const missing = (
    input: Parameters<typeof getMissingDues>[0],
    existing: string[],
  ) => getMissingDues(input, existing, now).map((s) => s.period);

  it('csak a legutóbbi meglévő időszak utáni hónapokat adja', () => {
    const m = { startDate: '2026-09-05', dueDay: 10, status: MembershipStatus.ACTIVE };
    expect(missing(m, ['2026-09'])).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(missing(m, ['2026-09', '2026-10', '2026-11', '2026-12'])).toEqual([]);
  });

  it('esedékességi nap módosítása nem hozza vissza a kihagyott kezdőhónapot', () => {
    // Kezdés okt. 20., dueDay 10 → október kimaradt; később dueDay 25-re vált
    const m = { startDate: '2026-10-20', dueDay: 25, status: MembershipStatus.ACTIVE };
    expect(missing(m, ['2026-11'])).toEqual(['2026-12']);
  });

  it('a folyó hónapnál későbbi, kézzel felvett időszak nem blokkolja a pótlást', () => {
    const m = { startDate: '2026-09-05', dueDay: 10, status: MembershipStatus.ACTIVE };
    expect(missing(m, ['2026-09', '2027-03'])).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('szünet utáni megszűnésnél a szünet napjáig számláz', () => {
    const stamps = getMembershipStatusTimestamps(
      { status: MembershipStatus.PAUSED, pausedAt: '2026-09-05T08:00:00Z' },
      MembershipStatus.TERMINATED,
      new Date('2026-11-20T08:00:00Z'),
    );
    expect(stamps.pausedAt).toEqual(new Date('2026-09-05T08:00:00Z'));
    expect(
      missing(
        {
          startDate: '2026-08-01',
          dueDay: 10,
          status: MembershipStatus.TERMINATED,
          ...stamps,
        },
        ['2026-08'],
      ),
    ).toEqual([]);
  });
});

describe('getOverdueDays / getOverdueBucket — késési kategóriák', () => {
  it('az esedékesség napján még nem késik, másnaptól naptári napokban számol', () => {
    const due = day('2026-11-10');
    expect(getOverdueDays(due, new Date('2026-11-09T12:00:00Z'))).toBe(0);
    expect(getOverdueDays(due, new Date('2026-11-10T20:00:00Z'))).toBe(0);
    expect(getOverdueDays(due, new Date('2026-11-10T23:30:00Z'))).toBe(1); // Bp: 11-e
    expect(getOverdueDays(due, new Date('2026-11-15T08:00:00Z'))).toBe(5);
    expect(getOverdueDays(due, new Date('2026-11-16T08:00:00Z'))).toBe(6);
  });

  it('budapesti éjfélre mentett (régi) dátumot is ugyanarra a napra értelmez', () => {
    expect(
      getOverdueDays(new Date('2026-11-09T23:00:00Z'), new Date('2026-11-15T08:00:00Z')),
    ).toBe(5);
  });

  it('kategóriahatárok: 1–5, 6–15, 15 nap felett', () => {
    expect(getOverdueBucket(0)).toBe(OverdueBucket.NONE);
    expect(getOverdueBucket(1)).toBe(OverdueBucket.DAYS_1_5);
    expect(getOverdueBucket(5)).toBe(OverdueBucket.DAYS_1_5);
    expect(getOverdueBucket(6)).toBe(OverdueBucket.DAYS_6_15);
    expect(getOverdueBucket(15)).toBe(OverdueBucket.DAYS_6_15);
    expect(getOverdueBucket(16)).toBe(OverdueBucket.DAYS_OVER_15);
  });
});

describe('getMembershipStatusTimestamps / isDueRemovableOnStop — státuszváltás', () => {
  const now = new Date('2026-11-05T10:00:00Z');

  it('szüneteltetéskor most a szünet napja, ismételt mentéskor megmarad', () => {
    expect(
      getMembershipStatusTimestamps({ status: MembershipStatus.ACTIVE }, MembershipStatus.PAUSED, now),
    ).toEqual({ pausedAt: now, terminatedAt: null });
    expect(
      getMembershipStatusTimestamps(
        { status: MembershipStatus.PAUSED, pausedAt: '2026-10-01T08:00:00Z' },
        MembershipStatus.PAUSED,
        now,
      ),
    ).toEqual({ pausedAt: new Date('2026-10-01T08:00:00Z'), terminatedAt: null });
  });

  it('újraaktiváláskor resumedAt = most, aktív tagság mentésekor nincs resumedAt', () => {
    expect(
      getMembershipStatusTimestamps(
        { status: MembershipStatus.PAUSED, pausedAt: '2026-10-01T08:00:00Z' },
        MembershipStatus.ACTIVE,
        now,
      ),
    ).toEqual({ pausedAt: null, terminatedAt: null, resumedAt: now });
    expect(
      getMembershipStatusTimestamps({ status: MembershipStatus.ACTIVE }, MembershipStatus.ACTIVE, now),
    ).toEqual({ pausedAt: null, terminatedAt: null });
  });

  it('csak az érintetlen, a leállás napja után esedékes díj törölhető', () => {
    const due = { status: 'PENDING', paidAmountHuf: 0, dueDate: day('2026-11-10') };
    expect(isDueRemovableOnStop(due, now)).toBe(true);
    expect(isDueRemovableOnStop({ ...due, paidAmountHuf: 1000, status: 'PARTIAL' }, now)).toBe(false);
    expect(isDueRemovableOnStop({ ...due, dueDate: day('2026-11-05') }, now)).toBe(false);
  });
});
