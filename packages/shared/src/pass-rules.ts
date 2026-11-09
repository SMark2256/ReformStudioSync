import { PassStatus, PassType } from './enums';
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
