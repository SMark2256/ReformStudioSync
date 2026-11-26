/**
 * Bérlet-hátralék (TICKET-14): részletfizetéssel eladott bérlet ki nem fizetett része.
 * Hátralék = eladáskori ár − a bérlethez rendelt, nem sztornózott befizetések. Egyetlen szabály
 * a szerveren és a mockban; a felület csak megjeleníti.
 */

/**
 * `NONE`: nincs hátralék (kifizetve vagy sztornózott eladás). `OUTSTANDING`: van hátralék.
 * `UNKNOWN`: az eladáskori ár vagy a befizetések nem ismertek. Fail-closed: a felület jelzi, nem 0-nak veszi.
 */
export type PassDebtStatus = 'NONE' | 'OUTSTANDING' | 'UNKNOWN';

/** A bérlethez rendelt befizetés egy része, amennyi a hátralékhoz kell. */
export interface PassDebtAllocation {
  amountHuf: number;
  /** A befizetés sztornózva: nem csökkenti a hátralékot. */
  isCancelled: boolean;
}

export interface PassDebtInput {
  /** Eladáskori ár (Ft); `null`/hiányzó: ismeretlen. */
  priceHuf?: number | null;
  /** Az eladás sztornója: a bérlet nem használható, hátralék sincs. */
  cancelledAt?: Date | string | null;
}

export interface PassDebt {
  status: PassDebtStatus;
  priceHuf: number | null;
  paidHuf: number;
  /** `null`, ha ismeretlen (`UNKNOWN`). */
  debtHuf: number | null;
}

/** `allocations` hiánya (nem töltöttük be) is ismeretlen hátralékot ad, nem nullát. */
export function computePassDebt(
  pass: PassDebtInput,
  allocations: readonly PassDebtAllocation[] | null | undefined,
): PassDebt {
  const paidHuf = (allocations ?? [])
    .filter((a) => !a.isCancelled)
    .reduce((sum, a) => sum + a.amountHuf, 0);
  const priceHuf = pass.priceHuf ?? null;

  if (pass.cancelledAt) {
    return { status: 'NONE', priceHuf, paidHuf, debtHuf: 0 };
  }
  if (priceHuf === null || !allocations) {
    return { status: 'UNKNOWN', priceHuf, paidHuf, debtHuf: null };
  }
  const debtHuf = Math.max(0, priceHuf - paidHuf);
  return {
    status: debtHuf > 0 ? 'OUTSTANDING' : 'NONE',
    priceHuf,
    paidHuf,
    debtHuf,
  };
}

/**
 * A hátralék keletkezésének időpontja egy változás után: amíg van hátralék, a korábbi időpont
 * marad (részfizetés nem indítja újra); kiegyenlítéskor `null`; ha újra keletkezik (pl. egy
 * részlet sztornója), `now`. Ismeretlen hátraléknál a korábbi érték változatlan.
 * Erre épül a TICKET-15 türelmi ideje.
 */
export function nextPassDebtSince<T extends Date | string>(
  current: T | null | undefined,
  debt: PassDebt,
  now: T,
): T | null {
  if (debt.status === 'UNKNOWN') return current ?? null;
  if (debt.status === 'NONE') return null;
  return current ?? now;
}

export interface PassDebtSummary {
  /** Az ismert hátralékok összege (Ft). */
  debtHuf: number;
  /** Van legalább egy bérlet, amelynek a hátraléka ismeretlen. */
  hasUnknown: boolean;
  /** A legkorábban keletkezett hátralék időpontja; `null`, ha nincs. */
  since: string | null;
}

/** Egy vendég bérleteinek hátraléka összesítve (recepciós kártya). */
export function summarizePassDebts(
  passes: readonly { debt: PassDebt; debtSince?: Date | string | null }[],
): PassDebtSummary {
  let debtHuf = 0;
  let hasUnknown = false;
  let since: string | null = null;
  for (const p of passes) {
    if (p.debt.status === 'UNKNOWN') {
      hasUnknown = true;
      continue;
    }
    if (p.debt.status !== 'OUTSTANDING') continue;
    debtHuf += p.debt.debtHuf ?? 0;
    if (p.debtSince) {
      const iso = new Date(p.debtSince).toISOString();
      if (since === null || iso < since) since = iso;
    }
  }
  return { debtHuf, hasUnknown, since };
}
