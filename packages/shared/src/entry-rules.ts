import { Gender, MembershipDueStatus, PassStatus } from './enums';
import { getOverdueDays } from './membership-dues';
import type { PassDebtStatus } from './pass-debt';
import {
  type ArrivalEntitlement,
  type ArrivalMembershipInput,
  type ArrivalPassInput,
  type DebtDeniedReason,
  resolveArrivalEntitlement,
} from './pass-rules';

/**
 * Egységes beléptetési szabály, tartozás (TICKET-15). Egyetlen forrás a szerveren, a mockban és az
 * offline szinkronban (az is a szerveren fut): a felület csak megjeleníti az eredményt.
 */

/**
 * Türelmi idő (naptári nap, Europe/Budapest). A kezdőnap a 0. nap: az 5. napon még beléphet,
 * a 6. naptól elutasítás. Tagdíjnál a kezdőnap az esedékesség, bérlet-hátraléknál a vásárlás napja.
 */
export const DEBT_GRACE_DAYS = 5;

/** A kivételes beengedés indoklásának legnagyobb hossza. */
export const CHECK_IN_OVERRIDE_REASON_MAX_LENGTH = 500;

/** Egy tagdíj-esedékesség, amennyi a tiltáshoz kell. */
export interface EntryDueInput {
  dueDate: Date | string;
  amountHuf: number;
  paidAmountHuf: number;
  status: MembershipDueStatus | string;
}

/** Egy bérlet hátraléka (`computePassDebt`) és a vásárlás időpontja. */
export interface EntryPassDebtInput {
  /** A vásárlás (eladás) időpontja; a szerveren a `created_at`, mindig ismert. */
  purchasedAt?: Date | string | null;
  debtStatus: PassDebtStatus;
  debtHuf?: number | null;
  /**
   * A bérlet számolt állapota (`getPassStatus`). Csak az ismeretlen hátraléknál számít: lezárt
   * (lejárt, elfogyott, sztornózott) bérletnél nem tilt. Hiányzik: fail-closed, tilt.
   */
  passStatus?: PassStatus | string;
}

/** Lezárt bérlet: már nem használható, ismeretlen hátraléka nem tilt (megrendelői döntés, 2026-11-26). */
const CLOSED_PASS_STATUSES: readonly string[] = [
  PassStatus.EXPIRED,
  PassStatus.DEPLETED,
  PassStatus.CANCELLED,
];

export interface EntryDebt {
  /** A türelmi időn túli tartozás miatt tiltva (kivételes beengedéssel feloldható). */
  blocked: boolean;
  /** A tiltás okai, sorrendben: tagdíj, bérlet-hátralék, ismeretlen hátralék. */
  reasons: DebtDeniedReason[];
  /** Lejárt, ki nem fizetett tagdíj összesen (Ft), a türelmi időn belüli is. */
  duesOverdueHuf: number;
  /** A legrégebbi lejárt tagdíj késése (naptári nap). */
  duesOverdueDays: number;
  /** A legrégebbi hátralékos bérlet vásárlása óta eltelt naptári napok. */
  passDebtDays: number;
}

/** Eltelt naptári napok; ismeretlen kezdőnapnál 0 (a szerveren nem fordul elő). */
function elapsedDays(from: Date | string | null | undefined, now: Date): number {
  if (!from || Number.isNaN(new Date(from).getTime())) return 0;
  return getOverdueDays(from, now);
}

/**
 * Tartozás miatti tiltás. Tagdíj: lejárt, nem fizetett / nem elengedett esedékesség maradékkal,
 * a késés > `DEBT_GRACE_DAYS`. Bérlet-hátralék: `OUTSTANDING`, a vásárlás óta > `DEBT_GRACE_DAYS`
 * nap (így a sztornó miatt újra keletkezett hátralék is a vásárlás napjától számít), bármely
 * bérletnél. Ismeretlen hátralék (`UNKNOWN`) ugyanígy, de csak érvényes (aktív, fagyasztott, még
 * nem kezdődött) bérletnél; lejárt, elfogyott vagy sztornózott bérletnél nem tilt. Ha a bérlet
 * állapota nem ismert, fail-closed: tilt, nem engedjük át csendben.
 */
export function evaluateEntryDebt(
  input: {
    dues: readonly EntryDueInput[];
    passDebts: readonly EntryPassDebtInput[];
  },
  now: Date = new Date(),
): EntryDebt {
  let duesOverdueHuf = 0;
  let duesOverdueDays = 0;
  for (const d of input.dues) {
    if (d.status === MembershipDueStatus.PAID || d.status === MembershipDueStatus.WAIVED) {
      continue;
    }
    const remaining = Math.max(0, d.amountHuf - d.paidAmountHuf);
    if (remaining <= 0 || new Date(d.dueDate).getTime() >= now.getTime()) continue;
    duesOverdueHuf += remaining;
    duesOverdueDays = Math.max(duesOverdueDays, elapsedDays(d.dueDate, now));
  }

  let passDebtDays = 0;
  let passDebtBlocked = false;
  let unknownBlocked = false;
  for (const p of input.passDebts) {
    if (p.debtStatus === 'NONE') continue;
    const days = elapsedDays(p.purchasedAt, now);
    if (p.debtStatus === 'OUTSTANDING') {
      passDebtDays = Math.max(passDebtDays, days);
      if (days > DEBT_GRACE_DAYS) passDebtBlocked = true;
    } else if (
      days > DEBT_GRACE_DAYS &&
      !(p.passStatus && CLOSED_PASS_STATUSES.includes(p.passStatus))
    ) {
      unknownBlocked = true;
    }
  }

  const reasons: DebtDeniedReason[] = [];
  if (duesOverdueDays > DEBT_GRACE_DAYS) reasons.push('DUES_OVERDUE');
  if (passDebtBlocked) reasons.push('PASS_DEBT');
  if (unknownBlocked) reasons.push('PASS_DEBT_UNKNOWN');

  return {
    blocked: reasons.length > 0,
    reasons,
    duesOverdueHuf,
    duesOverdueDays,
    passDebtDays,
  };
}

const huf = (amount: number) => `${amount.toLocaleString('hu-HU')} Ft`;

/** A tiltás okai szövegesen, összeggel és napokkal (`passDebtHuf`: `summarizePassDebts`). */
function debtCauses(debt: EntryDebt, passDebtHuf: number): string {
  return debt.reasons
    .map((reason) => {
      switch (reason) {
        case 'DUES_OVERDUE':
          return `havi tagdíj-elmaradás ${huf(debt.duesOverdueHuf)}, ${debt.duesOverdueDays} nap késés`;
        case 'PASS_DEBT':
          return `bérlet-hátralék ${huf(passDebtHuf)}, a vásárlás óta ${debt.passDebtDays} nap`;
        default:
          return 'egy bérlet hátraléka nem ismert, ellenőrizd az adatlapon';
      }
    })
    .join('; ');
}

/**
 * Az elutasítás oka a recepciónak (a monitorra nem kerül), összeggel és napokkal.
 * `passDebtHuf`: a vendég ismert bérlet-hátraléka összesen (`summarizePassDebts`).
 */
export function debtDeniedMessage(debt: EntryDebt, passDebtHuf = 0): string {
  return `Tartozás miatt elutasítva (türelmi idő: ${DEBT_GRACE_DAYS} nap): ${debtCauses(debt, passDebtHuf)}. Kivételes beengedés indoklással lehetséges.`;
}

/** A kivételes beengedés indoklása szóközök nélkül; üresen `null` (az API 400-zal elutasítja). */
export function normalizeOverrideReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** A `CHECKIN_OVERRIDE` audit-bejegyzés szövege: melyik vendég, melyik ok, milyen indoklással. */
export function checkInOverrideAuditDetails(input: {
  guestId: string;
  guestName: string;
  debt: EntryDebt;
  passDebtHuf?: number;
  reason: string;
}): string {
  const causes = debtCauses(input.debt, input.passDebtHuf ?? 0);
  return `Kivételes beengedés (${input.guestName}, vendég: ${input.guestId}). Elutasítási ok: ${input.debt.reasons.join(', ')} (${causes}). Indoklás: ${input.reason}`;
}

export interface CheckInAccess<P, M> {
  entitlement: ArrivalEntitlement<P, M>;
  debt: EntryDebt;
  /** A tartozás miatti tiltást kivételes beengedés oldotta fel (ekkor naplózni kell). */
  overridden: boolean;
}

/**
 * A beléptetés teljes döntése (TICKET-15): a jogosultság (`resolveArrivalEntitlement`), majd a
 * tartozás. Ha a vendég amúgy beléphetne (köredzés vagy kezelésválasztás), de a tartozása a türelmi
 * időn túl van, az eredmény `DENIED` (`overridable`), az okkal. `override`: kivételes beengedés,
 * ekkor a jogosultság marad, `overridden: true`. Más okú elutasítást az override nem old fel.
 */
export function resolveCheckInAccess<
  P extends ArrivalPassInput,
  M extends ArrivalMembershipInput,
>(
  input: {
    memberships: readonly M[];
    passes: readonly P[];
    guestGender?: Gender | string | null;
    dues: readonly EntryDueInput[];
    passDebts: readonly EntryPassDebtInput[];
    override?: boolean;
  },
  now: Date = new Date(),
): CheckInAccess<P, M> {
  const entitlement = resolveArrivalEntitlement(input, now);
  const debt = evaluateEntryDebt(input, now);
  if (entitlement.kind === 'DENIED' || !debt.blocked) {
    return { entitlement, debt, overridden: false };
  }
  if (input.override) return { entitlement, debt, overridden: true };
  return {
    entitlement: { kind: 'DENIED', reason: debt.reasons[0], overridable: true },
    debt,
    overridden: false,
  };
}
