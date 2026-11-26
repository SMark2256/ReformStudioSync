import {
  checkInOverrideAuditDetails,
  DEBT_GRACE_DAYS,
  debtDeniedMessage,
  evaluateEntryDebt,
  MembershipStatus,
  normalizeOverrideReason,
  PassType,
  resolveCheckInAccess,
  ServiceCategory,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

/** TICKET-15: tartozás miatti tiltás 5 nap türelmi idő után, kivételes beengedés. */
const NOW = new Date('2026-11-26T10:00:00.000Z'); // 11:00 Budapest

/** Esedékesség (UTC éjfél, mint a `getDueDate`), `daysAgo` naptári nappal ezelőtt. */
const due = (daysAgo: number, over: Record<string, unknown> = {}) => ({
  dueDate: new Date(Date.UTC(2026, 10, 26 - daysAgo)),
  amountHuf: 22000,
  paidAmountHuf: 0,
  status: 'PENDING',
  ...over,
});
/** Bérlet-hátralék, a vásárlás `daysAgo` naptári nappal ezelőtt 10:00-kor (UTC). */
const passDebt = (
  daysAgo: number,
  debtStatus: 'NONE' | 'OUTSTANDING' | 'UNKNOWN' = 'OUTSTANDING',
) => ({
  purchasedAt: new Date(Date.UTC(2026, 10, 26 - daysAgo, 10)),
  debtStatus,
});

const membership = { id: 'memb-1', status: MembershipStatus.ACTIVE };
const hypoxiPass = {
  id: 'pass-1',
  type: PassType.OCCASION_BASED,
  remainingPasses: 5,
  startDate: new Date('2026-11-01T00:00:00Z'),
  expirationDate: new Date('2026-12-31T00:00:00Z'),
  isFrozen: false,
  serviceId: 'srv-hypoxi',
  serviceCategory: ServiceCategory.BODY_SHAPING,
};

describe('evaluateEntryDebt — türelmi idő (TICKET-15)', () => {
  it('a türelmi idő 5 nap', () => {
    expect(DEBT_GRACE_DAYS).toBe(5);
  });

  it('tagdíj: az esedékesség utáni 5. napon még beenged, a 6. napon tilt', () => {
    const day5 = evaluateEntryDebt({ dues: [due(5)], passDebts: [] }, NOW);
    expect(day5).toMatchObject({
      blocked: false,
      reasons: [],
      duesOverdueHuf: 22000,
      duesOverdueDays: 5,
    });
    const day6 = evaluateEntryDebt({ dues: [due(6)], passDebts: [] }, NOW);
    expect(day6).toMatchObject({
      blocked: true,
      reasons: ['DUES_OVERDUE'],
      duesOverdueDays: 6,
    });
  });

  it('tagdíj: fizetett, elengedett vagy maradék nélküli esedékesség nem tilt; a részfizetés maradéka igen', () => {
    const res = evaluateEntryDebt(
      {
        dues: [
          due(30, { status: 'PAID', paidAmountHuf: 22000 }),
          due(30, { status: 'WAIVED' }),
          due(30, { status: 'PARTIAL', paidAmountHuf: 22000 }),
        ],
        passDebts: [],
      },
      NOW,
    );
    expect(res).toMatchObject({ blocked: false, duesOverdueHuf: 0 });

    const partial = evaluateEntryDebt(
      { dues: [due(9, { status: 'PARTIAL', paidAmountHuf: 12000 })], passDebts: [] },
      NOW,
    );
    expect(partial).toMatchObject({
      blocked: true,
      duesOverdueHuf: 10000,
      duesOverdueDays: 9,
    });
  });

  it('tagdíj: a jövőbeli esedékesség nem tartozás', () => {
    const res = evaluateEntryDebt({ dues: [due(-3)], passDebts: [] }, NOW);
    expect(res).toMatchObject({ blocked: false, duesOverdueHuf: 0, duesOverdueDays: 0 });
  });

  it('bérlet-hátralék: a vásárlás napja után az 5. napon még beenged, a 6. napon tilt', () => {
    expect(
      evaluateEntryDebt({ dues: [], passDebts: [passDebt(5)] }, NOW),
    ).toMatchObject({ blocked: false, passDebtDays: 5 });
    expect(
      evaluateEntryDebt({ dues: [], passDebts: [passDebt(6)] }, NOW),
    ).toMatchObject({ blocked: true, reasons: ['PASS_DEBT'], passDebtDays: 6 });
  });

  it('bérlet-hátralék: a napok a stúdió naptára szerint számítanak (este 23:30-as vásárlás is aznapi)', () => {
    // 2026-11-20 23:30 Budapest = 22:30 UTC: a 6. nap 11.26.
    const lateEvening = {
      purchasedAt: new Date('2026-11-20T22:30:00.000Z'),
      debtStatus: 'OUTSTANDING' as const,
    };
    expect(
      evaluateEntryDebt({ dues: [], passDebts: [lateEvening] }, NOW),
    ).toMatchObject({ blocked: true, passDebtDays: 6 });
  });

  it('kiegyenlített bérlet (NONE) nem tilt, akármilyen régi', () => {
    expect(
      evaluateEntryDebt({ dues: [], passDebts: [passDebt(60, 'NONE')] }, NOW),
    ).toMatchObject({ blocked: false, reasons: [], passDebtDays: 0 });
  });

  it('ismeretlen hátralék (UNKNOWN): fail-closed, a türelmi idő után tilt', () => {
    expect(
      evaluateEntryDebt({ dues: [], passDebts: [passDebt(5, 'UNKNOWN')] }, NOW),
    ).toMatchObject({ blocked: false });
    expect(
      evaluateEntryDebt({ dues: [], passDebts: [passDebt(6, 'UNKNOWN')] }, NOW),
    ).toMatchObject({ blocked: true, reasons: ['PASS_DEBT_UNKNOWN'] });
  });

  it('tagdíj és bérlet-hátralék együtt: mindkét ok, sorrendben', () => {
    const res = evaluateEntryDebt(
      { dues: [due(8)], passDebts: [passDebt(7), passDebt(10, 'UNKNOWN')] },
      NOW,
    );
    expect(res.reasons).toEqual(['DUES_OVERDUE', 'PASS_DEBT', 'PASS_DEBT_UNKNOWN']);
    expect(res).toMatchObject({ duesOverdueDays: 8, passDebtDays: 7 });
  });

  it('csak az egyik a türelmi időn túl: csak az az ok', () => {
    const res = evaluateEntryDebt(
      { dues: [due(2)], passDebts: [passDebt(9)] },
      NOW,
    );
    expect(res.reasons).toEqual(['PASS_DEBT']);
  });
});

describe('resolveCheckInAccess — jogosultság + tartozás (TICKET-15)', () => {
  const base = {
    memberships: [membership],
    passes: [hypoxiPass],
    dues: [] as ReturnType<typeof due>[],
    passDebts: [] as ReturnType<typeof passDebt>[],
  };

  it('tartozás nélkül a jogosultság változatlan', () => {
    const res = resolveCheckInAccess(base, NOW);
    expect(res.entitlement).toEqual({ kind: 'CIRCUIT_MEMBERSHIP', membership });
    expect(res.overridden).toBe(false);
  });

  it('türelmi időn túli tagdíj: köredzés helyett DENIED, feloldható', () => {
    const res = resolveCheckInAccess({ ...base, dues: [due(6)] }, NOW);
    expect(res.entitlement).toEqual({
      kind: 'DENIED',
      reason: 'DUES_OVERDUE',
      overridable: true,
    });
  });

  it('türelmi időn túli bérlet-hátralék: a kezelésválasztás is DENIED', () => {
    const res = resolveCheckInAccess(
      { ...base, memberships: [], passDebts: [passDebt(6)] },
      NOW,
    );
    expect(res.entitlement).toEqual({
      kind: 'DENIED',
      reason: 'PASS_DEBT',
      overridable: true,
    });
  });

  it('ismeretlen hátralék: DENIED PASS_DEBT_UNKNOWN, feloldható', () => {
    const res = resolveCheckInAccess(
      { ...base, passDebts: [passDebt(6, 'UNKNOWN')] },
      NOW,
    );
    expect(res.entitlement).toMatchObject({
      kind: 'DENIED',
      reason: 'PASS_DEBT_UNKNOWN',
      overridable: true,
    });
  });

  it('kivételes beengedés: a jogosultság marad, overridden: true', () => {
    const res = resolveCheckInAccess(
      { ...base, dues: [due(6)], passDebts: [passDebt(7)], override: true },
      NOW,
    );
    expect(res.entitlement).toEqual({ kind: 'CIRCUIT_MEMBERSHIP', membership });
    expect(res.overridden).toBe(true);
    expect(res.debt.reasons).toEqual(['DUES_OVERDUE', 'PASS_DEBT']);
  });

  it('override tiltás nélkül: nincs mit feloldani, overridden: false', () => {
    const res = resolveCheckInAccess({ ...base, override: true }, NOW);
    expect(res.overridden).toBe(false);
  });

  it('más okú elutasítást (nincs érvényes bérlet) az override nem old fel', () => {
    const res = resolveCheckInAccess(
      { ...base, memberships: [], passes: [], dues: [due(10)], override: true },
      NOW,
    );
    expect(res.entitlement).toEqual({ kind: 'DENIED', reason: 'NO_VALID_PASS' });
    expect(res.overridden).toBe(false);
  });
});

describe('szövegek és indoklás (TICKET-15)', () => {
  it('az elutasítás oka összeggel és napokkal', () => {
    const debt = evaluateEntryDebt(
      { dues: [due(8)], passDebts: [passDebt(7)] },
      NOW,
    );
    const msg = debtDeniedMessage(debt, 15000);
    expect(msg).toContain('türelmi idő: 5 nap');
    expect(msg).toContain('8 nap késés');
    expect(msg).toContain('a vásárlás óta 7 nap');
    expect(msg).toMatch(/22\s000 Ft/);
    expect(msg).toMatch(/15\s000 Ft/);
  });

  it('az indoklás kötelező: üres vagy csak szóköz → null', () => {
    expect(normalizeOverrideReason(undefined)).toBeNull();
    expect(normalizeOverrideReason('   ')).toBeNull();
    expect(normalizeOverrideReason('  Ma rendezi  ')).toBe('Ma rendezi');
  });

  it('az audit szövege: vendég, ok és indoklás', () => {
    const debt = evaluateEntryDebt({ dues: [due(8)], passDebts: [] }, NOW);
    const details = checkInOverrideAuditDetails({
      guestId: 'guest-1',
      guestName: 'Kovács Anna',
      debt,
      reason: 'Átutalta, bizonylat bemutatva',
    });
    expect(details).toContain('Kovács Anna');
    expect(details).toContain('guest-1');
    expect(details).toContain('DUES_OVERDUE');
    expect(details).toContain('Indoklás: Átutalta, bizonylat bemutatva');
  });
});
