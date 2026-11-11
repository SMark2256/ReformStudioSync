import {
  ARRIVAL_DENIED_MESSAGES,
  MembershipStatus,
  PassType,
  passGrantsCircuitEntry,
  resolveArrivalEntitlement,
  ServiceCategory,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-11T10:00:00.000Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);

const pass = (over: Record<string, unknown> = {}) => ({
  id: 'pass-1',
  type: PassType.OCCASION_BASED as PassType,
  remainingPasses: 8 as number | null,
  startDate: daysFromNow(-10),
  expirationDate: daysFromNow(30),
  isFrozen: false,
  cancelledAt: null as Date | null,
  serviceId: 'srv-hypoxi' as string | null,
  serviceCategory: ServiceCategory.BODY_SHAPING as ServiceCategory | null,
  ...over,
});

const circuitTimePass = (over: Record<string, unknown> = {}) =>
  pass({
    id: 'pass-circuit',
    type: PassType.TIME_BASED,
    remainingPasses: null,
    serviceId: 'srv-circuit',
    serviceCategory: ServiceCategory.CIRCUIT,
    ...over,
  });

describe('resolveArrivalEntitlement — vonalkódos beolvasás döntése (TICKET-39)', () => {
  it('aktív havi tagság: köredzés, akkor is, ha alkalmas bérlete is van', () => {
    const membership = { id: 'memb-1', status: MembershipStatus.ACTIVE };
    const res = resolveArrivalEntitlement(
      { memberships: [membership], passes: [pass()] },
      NOW,
    );
    expect(res).toEqual({ kind: 'CIRCUIT_MEMBERSHIP', membership });
  });

  it('köredzésre érvényes időalapú bérlet (CIRCUIT szolgáltatás vagy szolgáltatás nélkül): köredzés a bérletre', () => {
    const bound = circuitTimePass();
    expect(
      resolveArrivalEntitlement({ memberships: [], passes: [pass(), bound] }, NOW),
    ).toEqual({ kind: 'CIRCUIT_PASS', pass: bound });

    const unbound = circuitTimePass({ id: 'pass-open', serviceId: null, serviceCategory: null });
    expect(
      resolveArrivalEntitlement({ memberships: [], passes: [unbound] }, NOW),
    ).toEqual({ kind: 'CIRCUIT_PASS', pass: unbound });
  });

  it('alkalmas Hypoxi bérlet: kezelésválasztás, nem köredzés', () => {
    const hypoxi = pass();
    expect(
      resolveArrivalEntitlement({ memberships: [], passes: [hypoxi] }, NOW),
    ).toEqual({ kind: 'TREATMENT_SELECTION', passes: [hypoxi] });
  });

  it('nem köredzés szolgáltatáshoz kötött időalapú bérlet (kozmetika) sem ad köredzést', () => {
    const cosmetic = pass({
      id: 'pass-cosmetic',
      type: PassType.TIME_BASED,
      remainingPasses: null,
      serviceId: 'srv-facial',
      serviceCategory: ServiceCategory.COSMETIC,
    });
    expect(passGrantsCircuitEntry(cosmetic)).toBe(false);
    expect(
      resolveArrivalEntitlement({ memberships: [], passes: [cosmetic] }, NOW),
    ).toEqual({ kind: 'TREATMENT_SELECTION', passes: [cosmetic] });
  });

  it('kezelésválasztásnál csak érvényes bérletek, a leghamarabb lejáró elöl', () => {
    const later = pass({ id: 'later', expirationDate: daysFromNow(40) });
    const sooner = pass({ id: 'sooner', expirationDate: daysFromNow(5) });
    const depleted = pass({ id: 'depleted', remainingPasses: 0 });
    const expired = pass({ id: 'expired', expirationDate: daysFromNow(-1) });
    const notStarted = pass({ id: 'not-started', startDate: daysFromNow(2) });
    const cancelled = pass({ id: 'cancelled', cancelledAt: daysFromNow(-1) });
    const res = resolveArrivalEntitlement(
      { memberships: [], passes: [later, depleted, expired, notStarted, cancelled, sooner] },
      NOW,
    );
    expect(res.kind).toBe('TREATMENT_SELECTION');
    expect(res.kind === 'TREATMENT_SELECTION' && res.passes.map((p) => p.id)).toEqual([
      'sooner',
      'later',
    ]);
  });

  it('fagyasztott köredzés bérlet nem ad köredzést; fagyasztás után feloldva már igen', () => {
    const frozen = circuitTimePass({ isFrozen: true });
    expect(
      resolveArrivalEntitlement({ memberships: [], passes: [frozen] }, NOW),
    ).toEqual({ kind: 'DENIED', reason: 'PASS_FROZEN' });

    const unfrozen = circuitTimePass();
    expect(
      resolveArrivalEntitlement({ memberships: [], passes: [unfrozen] }, NOW).kind,
    ).toBe('CIRCUIT_PASS');
  });

  it('elutasítás: fagyasztott bérlet, szüneteltetett tagság, vagy semmi érvényes', () => {
    const paused = { status: MembershipStatus.PAUSED };
    expect(
      resolveArrivalEntitlement(
        { memberships: [paused], passes: [pass({ isFrozen: true })] },
        NOW,
      ),
    ).toEqual({ kind: 'DENIED', reason: 'PASS_FROZEN' });

    expect(
      resolveArrivalEntitlement({ memberships: [paused], passes: [] }, NOW),
    ).toEqual({ kind: 'DENIED', reason: 'MEMBERSHIP_PAUSED' });

    // Elfogyott, fagyasztott bérlet nem számít fagyasztott érvényes bérletnek.
    expect(
      resolveArrivalEntitlement(
        { memberships: [], passes: [pass({ isFrozen: true, remainingPasses: 0 })] },
        NOW,
      ),
    ).toEqual({ kind: 'DENIED', reason: 'NO_VALID_PASS' });
    expect(ARRIVAL_DENIED_MESSAGES.PASS_FROZEN).toContain('fagyasztva');
  });
});
