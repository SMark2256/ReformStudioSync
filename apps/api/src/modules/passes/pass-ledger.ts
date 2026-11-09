import { Prisma } from '@prisma/client';
import { appError, AppErrorCode, isPassOpen, VisitType } from '@reform/shared';

/**
 * Bérlet-alkalom főkönyv (TICKET-16). Minden levonás és jóváírás ezen megy át, így a
 * `remainingPasses` mező mindig = összes − nem visszavont levonások (`computeRemainingPasses`).
 * A mezőt a versenyhelyzet-védő atomi `updateMany` miatt tartjuk meg.
 * Csak `$transaction`-ön belül hívható.
 */

type Tx = Prisma.TransactionClient;

interface PassBalance {
  id: string;
  type: string;
  remainingPasses: number | null;
  isActive: boolean;
  cancelledAt?: Date | null;
}

/** Látogatás + beléptetés rögzítése, összekötve (a sztornó a látogatást is törli). */
export async function recordArrival(
  tx: Tx,
  data: {
    studioId: string;
    guestId: string;
    guestPassId: string | null;
    staffUserId: string;
    visitType: VisitType | 'CIRCUIT_TRAINING' | 'TREATMENT';
    reason?: string | null;
    idempotencyKey?: string | null;
  },
) {
  const visit = await tx.visit.create({
    data: {
      studioId: data.studioId,
      guestId: data.guestId,
      visitType: data.visitType,
      employeeId: data.staffUserId,
    },
  });

  return tx.loggedCheckIn.create({
    data: {
      studioId: data.studioId,
      guestId: data.guestId,
      guestPassId: data.guestPassId,
      userId: data.staffUserId,
      visitType: data.visitType,
      status: 'SUCCESS',
      reason: data.reason ?? null,
      idempotencyKey: data.idempotencyKey ?? null,
      visitId: visit.id,
    },
  });
}

/**
 * 1 alkalom levonása. Alkalmas bérletnél atomi `updateMany` véd a túlfogyasztás ellen;
 * időalapú bérletnél is készül `delta: -1` sor (ez a kezelés nyoma és visszavonható),
 * de alkalomszám nincs, így a számolást nem torzítja.
 */
export async function recordDeduction(
  tx: Tx,
  pass: PassBalance,
  data: {
    guestId: string;
    staffUserId: string;
    checkInId: string;
    serviceId?: string | null;
    operationKey?: string | null;
    note: string;
    balanceChangedError: AppErrorCode;
  },
): Promise<{ usageId: string; remaining: number | 'Korlátlan' }> {
  let remaining: number | 'Korlátlan' = 'Korlátlan';

  if (pass.type === 'OCCASION_BASED') {
    const atomicUpdate = await tx.guestPass.updateMany({
      where: {
        id: pass.id,
        isActive: true,
        isFrozen: false,
        cancelledAt: null,
        remainingPasses: { gt: 0 },
      },
      data: { remainingPasses: { decrement: 1 } },
    });
    if (atomicUpdate.count !== 1) {
      throw appError(data.balanceChangedError);
    }

    remaining = (pass.remainingPasses ?? 1) - 1;
    if (remaining <= 0) {
      await tx.guestPass.update({
        where: { id: pass.id },
        data: { isActive: false },
      });
    }
  }

  const usage = await tx.passUsageLog.create({
    data: {
      guestPassId: pass.id,
      guestId: data.guestId,
      serviceId: data.serviceId ?? null,
      employeeId: data.staffUserId,
      delta: -1,
      operationKey: data.operationKey ?? null,
      checkInId: data.checkInId,
      note: data.note,
    },
  });

  return { usageId: usage.id, remaining };
}

/**
 * Levonás visszavonása és 1 alkalom jóváírása — pontosan egyszer: a `reversedAt: null` feltételű
 * atomi jelölés miatt a második (párhuzamos vagy másik úton érkező) visszavonás hibát dob.
 */
export async function reverseDeduction(
  tx: Tx,
  usage: { id: string; guestPass: PassBalance },
  reason: string,
  now: Date,
): Promise<number | 'Korlátlan'> {
  const marked = await tx.passUsageLog.updateMany({
    where: { id: usage.id, delta: { lt: 0 }, reversedAt: null },
    data: { reversedAt: now, reversalReason: reason },
  });
  if (marked.count !== 1) {
    throw appError('PASS.USAGE_ALREADY_REVERSED');
  }

  const pass = usage.guestPass;
  if (pass.type !== 'OCCASION_BASED') return 'Korlátlan';

  // A kimerülés miatt lezárt bérlet újranyílik, a sztornózott nem.
  const updated = await tx.guestPass.update({
    where: { id: pass.id },
    data: {
      remainingPasses: { increment: 1 },
      isActive: isPassOpen(pass, (pass.remainingPasses ?? 0) + 1),
    },
  });
  return updated.remainingPasses ?? 1;
}

/**
 * Sikeres beléptetés érvénytelenítése (CANCELLED) és a hozzá tartozó látogatás törlése,
 * hogy a napi érkezésszám helyes maradjon. `false`, ha már nem volt sikeres.
 */
export async function voidArrival(
  tx: Tx,
  checkIn: { id: string; visitId: string | null },
  reason: string,
): Promise<boolean> {
  const res = await tx.loggedCheckIn.updateMany({
    where: { id: checkIn.id, status: 'SUCCESS' },
    data: { status: 'CANCELLED', reason },
  });
  if (res.count !== 1) return false;

  if (checkIn.visitId) {
    await tx.visit.deleteMany({ where: { id: checkIn.visitId } });
  }
  return true;
}

/** Korrekciós napló (ki, mikor, miért). Hiba esetén a teljes tranzakció visszagördül. */
export function logCorrection(
  tx: Tx,
  data: {
    studioId: string;
    staffUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string;
  },
) {
  return tx.auditLog.create({
    data: {
      studioId: data.studioId,
      userId: data.staffUserId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      details: data.details,
    },
  });
}
