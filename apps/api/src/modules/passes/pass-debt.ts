import { Prisma } from '@prisma/client';
import {
  computePassDebt,
  GuestPassDto,
  nextPassDebtSince,
  PassDebt,
} from '@reform/shared';

/**
 * Bérlet-hátralék (TICKET-14) a szerveren: a hátralékhoz szükséges betöltés, a DTO-mezők és a
 * keletkezési időpont frissítése befizetés, sztornó után. A szabály a `computePassDebt`.
 */

type Tx = Prisma.TransactionClient;

/** A bérlet `include`-jába: a hozzárendelt befizetések összege és sztornója. */
export const PASS_DEBT_INCLUDE = {
  allocations: {
    select: { amountHuf: true, payment: { select: { isCancelled: true } } },
  },
} as const;

interface PassWithAllocations {
  priceHuf?: number | null;
  cancelledAt?: Date | null;
  /** Hiányzik, ha nem töltöttük be: ekkor a hátralék ismeretlen (fail-closed). */
  allocations?: { amountHuf: number; payment: { isCancelled: boolean } }[];
}

export function passDebtOf(pass: PassWithAllocations): PassDebt {
  return computePassDebt(
    pass,
    pass.allocations?.map((a) => ({
      amountHuf: a.amountHuf,
      isCancelled: a.payment.isCancelled,
    })),
  );
}

/** A `GuestPassDto` hátralék-mezői. */
export function passDebtFields(
  pass: PassWithAllocations & { debtSince?: Date | null },
): Pick<
  GuestPassDto,
  'priceHuf' | 'paidHuf' | 'debtHuf' | 'debtStatus' | 'debtSince'
> {
  const debt = passDebtOf(pass);
  return {
    priceHuf: debt.priceHuf,
    paidHuf: debt.paidHuf,
    debtHuf: debt.debtHuf,
    debtStatus: debt.status,
    debtSince:
      debt.status === 'OUTSTANDING' || debt.status === 'UNKNOWN'
        ? (pass.debtSince?.toISOString() ?? null)
        : null,
  };
}

/**
 * A hátralék újraszámolása a bérlet befizetéseinek változása után, és a keletkezési időpont
 * mentése (`nextPassDebtSince`). A hívó tranzakciójában fut, a változás után.
 */
export async function refreshPassDebtSince(
  tx: Tx,
  passId: string,
  now: Date,
): Promise<PassDebt | null> {
  const pass = await tx.guestPass.findUnique({
    where: { id: passId },
    select: {
      priceHuf: true,
      cancelledAt: true,
      debtSince: true,
      ...PASS_DEBT_INCLUDE,
    },
  });
  if (!pass) return null;

  const debt = passDebtOf(pass);
  const debtSince = nextPassDebtSince(pass.debtSince, debt, now);
  if (debtSince?.getTime() !== pass.debtSince?.getTime()) {
    await tx.guestPass.update({ where: { id: passId }, data: { debtSince } });
  }
  return debt;
}
