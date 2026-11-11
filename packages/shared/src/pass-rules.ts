import { MembershipStatus, PassStatus, PassType, ServiceCategory } from './enums';
import type { AppErrorCode } from './errors/catalog';
import { STUDIO_TIME_ZONE } from './membership-dues';


const studioDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Naptári nap a stúdió időzónájában, `YYYY-MM-DD` alakban (szövegként összehasonlítható). */
export function toStudioDayKey(date: Date | string): string {
  return studioDayFormatter.format(new Date(date));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fagyasztás feloldásakor jóváírt napok: naptári napok a fagyasztás és a feloldás napja között
 * a stúdió időzónájában (11.07 12:46 → 11.11 18:39 = 4 nap), legalább 1.
 */
export function frozenDaysBetween(frozenAt: Date | string, unfrozenAt: Date | string): number {
  const from = Date.parse(`${toStudioDayKey(frozenAt)}T00:00:00Z`);
  const to = Date.parse(`${toStudioDayKey(unfrozenAt)}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / DAY_MS));
}

/** Fagyasztható-e a bérlet: csak az érvényes (aktív vagy még nem kezdődött) bérlet. A feloldás mindig mehet. */
export function isPassFreezable(status: PassStatus): boolean {
  return status === PassStatus.ACTIVE || status === PassStatus.NOT_STARTED;
}

/** A felhasználási napló egy sora, amennyi az alkalomszámításhoz kell. */
export interface PassLedgerEntry {
  delta: number;
  reversedAt?: Date | string | null;
}

/** Érvényes (nem visszavont) levonások száma. A pozitív/nulla sorok (vásárlás, hosszabbítás, fagyasztás) nem számítanak. */
export function countActiveDeductions(logs: readonly PassLedgerEntry[]): number {
  return logs.filter((l) => l.delta < 0 && !l.reversedAt).length;
}

/**
 * Hátralévő alkalom = összes − nem visszavont levonások. Egyetlen forrás a szerveren, a mockban és a felületen.
 * Időalapú bérletnél (nincs alkalomszám) `null`.
 */
export function computeRemainingPasses(
  totalPasses: number | null | undefined,
  logs: readonly PassLedgerEntry[],
): number | null {
  if (totalPasses === null || totalPasses === undefined) return null;
  return Math.max(0, totalPasses - countActiveDeductions(logs));
}

export interface PassStatusInput {
  type: PassType | string;
  /** Hátralévő alkalom, lehetőleg a `computeRemainingPasses` eredménye. */
  remainingPasses: number | null | undefined;
  startDate: Date | string;
  expirationDate: Date | string;
  isFrozen: boolean;
  cancelledAt?: Date | string | null;
}

/**
 * Számolt bérletállapot. Sorrend: sztornózott → fagyasztott → még nem kezdődött → lejárt → elfogyott → aktív.
 * A kezdés és a lejárat napra pontos (Europe/Budapest): a lejárat napján 23:59-kor még érvényes.
 */
export function getPassStatus(pass: PassStatusInput, now: Date = new Date()): PassStatus {
  if (pass.cancelledAt) return PassStatus.CANCELLED;
  if (pass.isFrozen) return PassStatus.FROZEN;
  const today = toStudioDayKey(now);
  if (today < toStudioDayKey(pass.startDate)) return PassStatus.NOT_STARTED;
  if (today > toStudioDayKey(pass.expirationDate)) return PassStatus.EXPIRED;
  if (pass.type === PassType.OCCASION_BASED && (pass.remainingPasses ?? 0) <= 0) {
    return PassStatus.DEPLETED;
  }
  return PassStatus.ACTIVE;
}

/**
 * Nyitott-e a bérlet (a tárolt `isActive` jelző értéke): nincs sztornózva, és időalapú vagy van még alkalma.
 * A lejáratot és a fagyasztást a `getPassStatus` kezeli.
 */
export function isPassOpen(
  pass: { type: PassType | string; cancelledAt?: Date | string | null },
  remainingPasses: number | null | undefined,
): boolean {
  return !pass.cancelledAt && (pass.type === PassType.TIME_BASED || (remainingPasses ?? 0) > 0);
}

/** A szolgáltatáshoz kötött bérlet csak arra a kezelésre szól; a nem kötött bármelyikre. */
export function passCoversService(
  passServiceId: string | null | undefined,
  serviceId: string,
): boolean {
  return !passServiceId || passServiceId === serviceId;
}

/** A beolvasáskori döntéshez (`resolveArrivalEntitlement`) szükséges bérletadatok. */
export interface ArrivalPassInput extends PassStatusInput {
  serviceId?: string | null;
  /** A bérlet szolgáltatásának kategóriája (szolgáltatáshoz kötött bérletnél). */
  serviceCategory?: ServiceCategory | string | null;
}

/**
 * Köredzésre jogosít-e a bérlet: csak időalapú bérlet, amely nincs szolgáltatáshoz kötve, vagy
 * a szolgáltatása köredzés (CIRCUIT). Alkalmas bérlet köredzésre sem ad ingyenes belépést.
 */
export function passGrantsCircuitEntry(pass: {
  type: PassType | string;
  serviceId?: string | null;
  serviceCategory?: ServiceCategory | string | null;
}): boolean {
  return (
    pass.type === PassType.TIME_BASED &&
    (!pass.serviceId || pass.serviceCategory === ServiceCategory.CIRCUIT)
  );
}

export type ArrivalDeniedReason = 'PASS_FROZEN' | 'MEMBERSHIP_PAUSED' | 'NO_VALID_PASS';

/** Az elutasított beolvasás oka a recepciónak (a monitorra nem kerül). */
export const ARRIVAL_DENIED_MESSAGES: Record<ArrivalDeniedReason, string> = {
  PASS_FROZEN: 'A vendég bérlete jelenleg fagyasztva van (szünetel).',
  MEMBERSHIP_PAUSED: 'A vendég havi tagsága jelenleg szüneteltetve van.',
  NO_VALID_PASS:
    'Nincs érvényes bérlet vagy aktív tagság (lejárt vagy elfogytak az alkalmak)!',
};

export type ArrivalEntitlement<P, M> =
  /** Aktív havi tagság: köredzés, 0 levonás. */
  | { kind: 'CIRCUIT_MEMBERSHIP'; membership: M }
  /** Köredzésre érvényes időalapú bérlet: köredzés, 0 levonás. */
  | { kind: 'CIRCUIT_PASS'; pass: P }
  /** Csak kezelésre szóló bérlet: a beolvasás nem léptet be, a kezelésválasztó nyílik meg. */
  | { kind: 'TREATMENT_SELECTION'; passes: P[] }
  | { kind: 'DENIED'; reason: ArrivalDeniedReason };

/**
 * Vonalkódos beolvasás döntése (TICKET-39), egyetlen forrás az API-n és a mockban:
 * 1. aktív havi tagság → köredzés belépés;
 * 2. különben a leghamarabb lejáró, köredzésre érvényes időalapú bérlet → köredzés belépés;
 * 3. különben ha van érvényes (aktív) bérlet → kezelésválasztás, a leghamarabb lejáró elöl;
 * 4. különben elutasítás (fagyasztott bérlet, szüneteltetett tagság vagy nincs érvényes bérlet).
 * A beolvasás soha nem von le alkalmat; az a kezelésválasztó megerősítésekor történik.
 */
export function resolveArrivalEntitlement<
  P extends ArrivalPassInput,
  M extends { status: MembershipStatus | string },
>(
  input: { memberships: readonly M[]; passes: readonly P[] },
  now: Date = new Date(),
): ArrivalEntitlement<P, M> {
  const membership = input.memberships.find(
    (m) => m.status === MembershipStatus.ACTIVE,
  );
  if (membership) return { kind: 'CIRCUIT_MEMBERSHIP', membership };

  const usable = input.passes
    .filter((p) => getPassStatus(p, now) === PassStatus.ACTIVE)
    .sort(
      (a, b) =>
        new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime(),
    );

  const circuitPass = usable.find(passGrantsCircuitEntry);
  if (circuitPass) return { kind: 'CIRCUIT_PASS', pass: circuitPass };

  if (usable.length > 0) return { kind: 'TREATMENT_SELECTION', passes: usable };

  const today = toStudioDayKey(now);
  const hasFrozenPass = input.passes.some(
    (p) =>
      p.isFrozen &&
      isPassOpen(p, p.remainingPasses) &&
      today <= toStudioDayKey(p.expirationDate),
  );
  if (hasFrozenPass) return { kind: 'DENIED', reason: 'PASS_FROZEN' };
  if (input.memberships.some((m) => m.status === MembershipStatus.PAUSED)) {
    return { kind: 'DENIED', reason: 'MEMBERSHIP_PAUSED' };
  }
  return { kind: 'DENIED', reason: 'NO_VALID_PASS' };
}

/** Miért nem vonható le alkalom az adott állapotú bérletről (`null`, ha levonható). */
export function passDeductionError(status: PassStatus): AppErrorCode | null {
  switch (status) {
    case PassStatus.ACTIVE:
      return null;
    case PassStatus.FROZEN:
      return 'PASS.FROZEN';
    case PassStatus.NOT_STARTED:
      return 'PASS.NOT_STARTED';
    case PassStatus.DEPLETED:
      return 'PASS.NO_REMAINING';
    default:
      return 'PASS.EXPIRED';
  }
}
