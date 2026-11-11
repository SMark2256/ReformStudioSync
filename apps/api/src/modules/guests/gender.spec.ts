import {
  FEMALE_FIRST_NAMES,
  Gender,
  inferGenderFromFirstName,
  MALE_FIRST_NAMES,
  normalizeFirstName,
  pickCircuitMembershipService,
  resolveArrivalEntitlement,
  womenOnlyAccess,
} from '@reform/shared';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/** TICKET-42: a vendég neme és a csak nőknek szóló szolgáltatás közös (packages/shared) szabályai. */
describe('inferGenderFromFirstName', () => {
  it('a demóvendégek: Anna, Dóra, Eszter, Zsófia → nő; Gábor, Péter → férfi; „Élő” → nincs megadva', () => {
    for (const name of ['Anna', 'Dóra', 'Eszter', 'Zsófia']) {
      expect(inferGenderFromFirstName(name)).toBe(Gender.FEMALE);
    }
    for (const name of ['Gábor', 'Péter']) {
      expect(inferGenderFromFirstName(name)).toBe(Gender.MALE);
    }
    expect(inferGenderFromFirstName('Élő')).toBe(Gender.UNSPECIFIED);
  });

  it('kis- és nagybetű, ékezet és szóközök nem számítanak', () => {
    expect(inferGenderFromFirstName('  ZSÓFIA ')).toBe(Gender.FEMALE);
    expect(inferGenderFromFirstName('zsofia')).toBe(Gender.FEMALE);
    expect(inferGenderFromFirstName('ÁGNES')).toBe(Gender.FEMALE);
    expect(inferGenderFromFirstName('lőrinc')).toBe(Gender.MALE);
    expect(inferGenderFromFirstName('Tünde')).toBe(Gender.FEMALE);
  });

  it('összetett keresztnévnél az első tag dönt', () => {
    expect(inferGenderFromFirstName('Anna Mária')).toBe(Gender.FEMALE);
    expect(inferGenderFromFirstName('Anna-Mária')).toBe(Gender.FEMALE);
    expect(inferGenderFromFirstName('Péter Pál')).toBe(Gender.MALE);
  });

  it('üres vagy ismeretlen névnél nincs megadva', () => {
    expect(inferGenderFromFirstName('')).toBe(Gender.UNSPECIFIED);
    expect(inferGenderFromFirstName(null)).toBe(Gender.UNSPECIFIED);
    expect(inferGenderFromFirstName('Kovács')).toBe(Gender.UNSPECIFIED);
  });

  it('a két lista normalizált alakú, nincs bennük ismétlődés és közös név', () => {
    for (const list of [FEMALE_FIRST_NAMES, MALE_FIRST_NAMES]) {
      expect(new Set(list).size).toBe(list.length);
      for (const name of list) expect(normalizeFirstName(name)).toBe(name);
    }
    const male = new Set(MALE_FIRST_NAMES);
    expect(FEMALE_FIRST_NAMES.filter((n) => male.has(n))).toEqual([]);
  });

  it('a migráció ugyanazt a névlistát használja, mint a shared függvény', () => {
    const sql = readFileSync(
      path.resolve(
        __dirname,
        '../../../prisma/migrations/20261111180000_guest_gender_women_only/migration.sql',
      ),
      'utf8',
    );
    const namesAfter = (marker: string) => {
      const start = sql.indexOf(marker);
      const block = sql.slice(start, sql.indexOf(');', start));
      const inList = block.slice(block.indexOf(') IN ('));
      return [...inList.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    };
    expect(namesAfter('-- FEMALE_FIRST_NAMES')).toEqual([...FEMALE_FIRST_NAMES]);
    expect(namesAfter('-- MALE_FIRST_NAMES')).toEqual([...MALE_FIRST_NAMES]);
  });
});

describe('womenOnlyAccess', () => {
  it('nem csak nőknek szóló szolgáltatásnál mindenki mehet', () => {
    expect(womenOnlyAccess(Gender.MALE, false)).toBe('ALLOWED');
    expect(womenOnlyAccess(Gender.UNSPECIFIED, null)).toBe('ALLOWED');
  });

  it('csak nőknek: nő mehet, férfi nem, ismeretlen nemnél figyelmeztetés', () => {
    expect(womenOnlyAccess(Gender.FEMALE, true)).toBe('ALLOWED');
    expect(womenOnlyAccess(Gender.MALE, true)).toBe('DENIED');
    expect(womenOnlyAccess(Gender.UNSPECIFIED, true)).toBe('GENDER_MISSING');
    expect(womenOnlyAccess(undefined, true)).toBe('GENDER_MISSING');
  });
});

describe('pickCircuitMembershipService', () => {
  it('a CIRCUIT szolgáltatások közül az aktív, azon belül a legrégebbi', () => {
    const services = [
      { id: 'hypoxi', category: 'BODY_SHAPING', isActive: true, createdAt: '2026-01-01' },
      { id: 'old-inactive', category: 'CIRCUIT', isActive: false, createdAt: '2025-01-01' },
      { id: 'newer', category: 'CIRCUIT', isActive: true, createdAt: '2026-06-01' },
      { id: 'older', category: 'CIRCUIT', isActive: true, createdAt: '2026-02-01' },
    ];
    expect(pickCircuitMembershipService(services)?.id).toBe('older');
    expect(pickCircuitMembershipService(services.slice(0, 1))).toBeNull();
  });
});

describe('resolveArrivalEntitlement — csak nőknek szóló tagság és bérlet', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  const membership = { id: 'mem', status: 'ACTIVE', womenOnly: true };
  const circuitPass = {
    id: 'circuit',
    type: 'TIME_BASED',
    remainingPasses: null,
    startDate: '2026-11-01T00:00:00Z',
    expirationDate: '2026-11-30T00:00:00Z',
    isFrozen: false,
    serviceId: 'srv-circuit',
    serviceCategory: 'CIRCUIT',
    womenOnly: true,
  };
  const hypoxiPass = {
    ...circuitPass,
    id: 'hypoxi',
    type: 'OCCASION_BASED',
    remainingPasses: 3,
    serviceId: 'srv-hypoxi',
    serviceCategory: 'BODY_SHAPING',
    womenOnly: false,
  };

  it('női vendég: a tagság köredzés belépést ad', () => {
    expect(
      resolveArrivalEntitlement(
        { guestGender: Gender.FEMALE, memberships: [membership], passes: [] },
        now,
      ).kind,
    ).toBe('CIRCUIT_MEMBERSHIP');
  });

  it('ismeretlen nem: belépés (a figyelmeztetést a hívó adja)', () => {
    expect(
      resolveArrivalEntitlement(
        { guestGender: Gender.UNSPECIFIED, memberships: [], passes: [circuitPass] },
        now,
      ).kind,
    ).toBe('CIRCUIT_PASS');
  });

  it('férfi vendég: a csak nőknek szóló tagság és bérlet nem számít → WOMEN_ONLY', () => {
    expect(
      resolveArrivalEntitlement(
        { guestGender: Gender.MALE, memberships: [membership], passes: [circuitPass] },
        now,
      ),
    ).toEqual({ kind: 'DENIED', reason: 'WOMEN_ONLY' });
  });

  it('férfi vendég más érvényes bérlettel: kezelésválasztás csak azzal', () => {
    const res = resolveArrivalEntitlement(
      {
        guestGender: Gender.MALE,
        memberships: [membership],
        passes: [circuitPass, hypoxiPass],
      },
      now,
    );
    expect(res.kind).toBe('TREATMENT_SELECTION');
    expect(res.kind === 'TREATMENT_SELECTION' && res.passes.map((p) => p.id)).toEqual([
      'hypoxi',
    ]);
  });

  it('férfi vendég lejárt női bérlettel: nem WOMEN_ONLY, hanem nincs érvényes bérlet', () => {
    expect(
      resolveArrivalEntitlement(
        {
          guestGender: Gender.MALE,
          memberships: [],
          passes: [{ ...circuitPass, expirationDate: '2026-11-05T00:00:00Z' }],
        },
        now,
      ),
    ).toEqual({ kind: 'DENIED', reason: 'NO_VALID_PASS' });
  });
});
