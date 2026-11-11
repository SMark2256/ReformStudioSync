import {
  CheckInStatus,
  GuestArrivalDto,
  MEMBERSHIP_ARRIVAL_PASS_NAME,
  toGuestArrivals,
  VisitType,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';
import {
  arrivalsForPass,
  arrivalTitle,
  formatArrivalDateTime,
} from './arrivals';

const arrival = (overrides: Partial<GuestArrivalDto>): GuestArrivalDto => ({
  id: 'chk-1',
  occurredAt: '2026-11-10T13:52:00.000Z',
  visitType: VisitType.CIRCUIT_TRAINING,
  serviceName: null,
  guestPassId: null,
  passName: null,
  staffName: 'Recepciós Munkatárs',
  status: CheckInStatus.SUCCESS,
  reason: null,
  ...overrides,
});

describe('vendégadatlap belépések (TICKET-40)', () => {
  it('a cím a belépés fajtája, a szolgáltatással, ha más a neve', () => {
    expect(arrivalTitle(arrival({}))).toBe('Köredzés');
    expect(arrivalTitle(arrival({ serviceName: 'Köredzés' }))).toBe('Köredzés');
    expect(
      arrivalTitle(
        arrival({ visitType: VisitType.TREATMENT, serviceName: 'Hypoxi' }),
      ),
    ).toBe('Kezelés · Hypoxi');
    expect(arrivalTitle(arrival({ visitType: VisitType.TREATMENT }))).toBe(
      'Kezelés',
    );
  });

  it('az időpont a stúdió időzónájában látszik', () => {
    // 13:52 UTC novemberben 14:52 Budapesten.
    expect(formatArrivalDateTime('2026-11-10T13:52:00.000Z')).toContain('14:52');
  });

  it('a bérlet belépései a bérlethez kötött sorok', () => {
    const list = [
      arrival({ id: 'a', guestPassId: 'pass-1' }),
      arrival({ id: 'b', guestPassId: null }),
      arrival({ id: 'c', guestPassId: 'pass-1', status: CheckInStatus.CANCELLED }),
    ];
    expect(arrivalsForPass(list, 'pass-1').map((a) => a.id)).toEqual(['a', 'c']);
    expect(arrivalsForPass(undefined, 'pass-1')).toEqual([]);
  });

  it('a közös leképezés (API és mock): sorrend, dupla beolvasás, tagság, okok', () => {
    const base = {
      visitType: 'CIRCUIT_TRAINING' as const,
      reason: null,
      guestPassId: null,
      passName: null,
      usageServiceName: null,
      passServiceName: null,
      staffName: null,
    };
    const result = toGuestArrivals([
      { ...base, id: 'old', createdAt: '2026-11-01T08:00:00.000Z', status: 'SUCCESS' },
      { ...base, id: 'dup', createdAt: '2026-11-02T08:00:00.000Z', status: 'DUPLICATE_SCAN' },
      {
        ...base,
        id: 'denied',
        createdAt: '2026-11-03T08:00:00.000Z',
        status: 'DENIED',
        reason: 'Nincs érvényes bérlet.',
        guestPassId: 'pass-1',
        passName: '10 Alkalmas Hypoxi Bérlet',
        passServiceName: 'Hypoxi',
      },
      {
        ...base,
        id: 'treatment',
        createdAt: '2026-11-04T08:00:00.000Z',
        status: 'SUCCESS',
        visitType: 'TREATMENT',
        reason: 'Kezelés: Hypoxi',
        guestPassId: 'pass-1',
        passName: '10 Alkalmas Hypoxi Bérlet',
        usageServiceName: 'Hypoxi',
      },
    ]);

    expect(result.map((a) => a.id)).toEqual(['treatment', 'denied', 'old']);
    expect(result[0]).toMatchObject({ serviceName: 'Hypoxi', reason: null });
    expect(result[1]).toMatchObject({
      serviceName: null,
      reason: 'Nincs érvényes bérlet.',
      passName: '10 Alkalmas Hypoxi Bérlet',
    });
    expect(result[2]).toMatchObject({
      passName: MEMBERSHIP_ARRIVAL_PASS_NAME,
      staffName: 'Recepciós Munkatárs',
    });
  });
});
