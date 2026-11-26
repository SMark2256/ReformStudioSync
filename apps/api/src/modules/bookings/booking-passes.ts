import type { BookableTreatment, Booking, GuestPass, Prisma } from '@prisma/client';
import {
  BookingDeductionOutcome,
  BookingPassInput,
  BookingPassWarning,
  bookingPassWarning,
  computeRemainingPasses,
  pickBookingPass,
} from '@reform/shared';
import {
  logCorrection,
  recordArrival,
  recordDeduction,
  reverseDeduction,
  voidArrival,
} from '../passes/pass-ledger';

/**
 * Bérlethasználat foglalásnál (TICKET-57), a meglévő bérletfőkönyvre építve
 * (`pass-ledger`: atomi levonás, visszavonás, beléptetés).
 *
 * - Foglaláskor nincs levonás, csak figyelmeztetés (lejárt, 0 alkalmas, hiányzó bérlet, vagy több
 *   a foglalás, mint az alkalom); tartozás sem keletkezik.
 * - Megérkezéskor vagy a recepciós „Nem jelent meg” rögzítésekor pontosan egy alkalom levonása
 *   a megfelelő, felhasználható bérletből (`pickBookingPass`). Az idempotenciakulcs
 *   `booking:<foglalás>:<sorszám>`; a foglalás sora zárolt, így ismétlés vagy dupla kattintás sem
 *   von le kétszer. Visszavonás után a sorszám nő, így a következő levonás új kulcsot kap.
 * - Ha a vendégnek aznap már levontak ugyanerre a kezelésre (pl. kártyabeolvasás után a
 *   „Kezelés -1” gombbal), a foglalás ahhoz kapcsolódik, nem von le újra.
 */

type Tx = Prisma.TransactionClient;

export interface LoadedGuestPass extends BookingPassInput {
  row: GuestPass;
  name: string;
  serviceName: string | null;
}

export async function loadGuestPasses(tx: Tx, guestId: string): Promise<LoadedGuestPass[]> {
  const passes = await tx.guestPass.findMany({ where: { guestId }, orderBy: { expirationDate: 'asc' } });
  if (passes.length === 0) return [];
  const templateIds = [...new Set(passes.map((p) => p.passTemplateId))];
  const [templates, logs] = await Promise.all([
    tx.passTemplate.findMany({ where: { id: { in: templateIds } } }),
    tx.passUsageLog.findMany({ where: { guestPassId: { in: passes.map((p) => p.id) } } }),
  ]);
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const serviceIds = [
    ...new Set(
      passes
        .map((p) => p.serviceId ?? templateById.get(p.passTemplateId)?.serviceId ?? null)
        .filter((id): id is string => !!id),
    ),
  ];
  const services = serviceIds.length
    ? await tx.service.findMany({ where: { id: { in: serviceIds } } })
    : [];
  const serviceById = new Map(services.map((s) => [s.id, s]));

  return passes.map((p) => {
    const template = templateById.get(p.passTemplateId);
    const serviceId = p.serviceId ?? template?.serviceId ?? null;
    const service = serviceId ? serviceById.get(serviceId) : undefined;
    return {
      row: p,
      id: p.id,
      type: p.type,
      remainingPasses: computeRemainingPasses(
        p.totalPasses,
        logs.filter((l) => l.guestPassId === p.id),
      ),
      startDate: p.startDate,
      expirationDate: p.expirationDate,
      validUntil: p.validUntil,
      isFrozen: p.isFrozen,
      cancelledAt: p.cancelledAt,
      serviceId,
      womenOnly: service?.womenOnly ?? false,
      name: template?.name ?? 'Bérlet',
      serviceName: service?.name ?? null,
    };
  });
}

/**
 * Foglaláskori figyelmeztetés kezelésenként. A „több a foglalás, mint az alkalom” számításához
 * a vendég még le nem vont, jövőbeli foglalásai az adott szolgáltatásra, plusz az új tételek.
 */
export async function computePassWarnings(
  tx: Tx,
  guestId: string,
  guestGender: string | null,
  treatments: readonly BookableTreatment[],
  now: Date,
): Promise<Map<string, BookingPassWarning | null>> {
  const passes = await loadGuestPasses(tx, guestId);
  const upcoming = await tx.booking.findMany({
    where: {
      guestId,
      status: { in: ['CONFIRMED', 'LATE'] },
      startsAt: { gte: now },
      passUsageId: null,
    },
  });
  const allTreatments = upcoming.length
    ? await tx.bookableTreatment.findMany({
        where: { id: { in: [...new Set(upcoming.map((b) => b.treatmentId))] } },
      })
    : [];
  const serviceOf = new Map(allTreatments.map((t) => [t.id, t.serviceId]));

  const result = new Map<string, BookingPassWarning | null>();
  for (const treatment of treatments) {
    const sameService = (serviceId: string | null | undefined) =>
      (serviceId ?? null) === (treatment.serviceId ?? null);
    const existing = upcoming.filter((b) => sameService(serviceOf.get(b.treatmentId))).length;
    const inGroup = treatments.filter((t) => sameService(t.serviceId)).length;
    result.set(
      treatment.id,
      bookingPassWarning(passes, treatment.serviceId, existing + inGroup, now, guestGender),
    );
  }
  return result;
}

export interface DeductionResult {
  outcome: BookingDeductionOutcome;
  passName: string | null;
  remainingPasses: number | 'Korlátlan' | null;
}

const NO_DEDUCTION: DeductionResult = { outcome: 'NONE', passName: null, remainingPasses: null };

export function bookingOperationKey(booking: Pick<Booking, 'id' | 'deductionSeq'>): string {
  return `booking:${booking.id}:${booking.deductionSeq}`;
}

/**
 * Egy alkalom levonása a foglaláshoz (a hívó a foglalás sorát már zárolta). Pontosan egyszer:
 * meglévő, nem visszavont levonásnál nem történik semmi.
 */
export async function deductForBooking(
  tx: Tx,
  input: {
    booking: Booking;
    treatment: BookableTreatment;
    kind: 'ARRIVED' | 'NO_SHOW';
    staffUserId: string;
    guestGender: string | null;
    dayStart: Date;
    dayEnd: Date;
    now: Date;
  },
): Promise<DeductionResult> {
  const { booking, treatment, now } = input;

  if (booking.passUsageId) {
    const usage = await tx.passUsageLog.findUnique({ where: { id: booking.passUsageId } });
    if (usage && !usage.reversedAt) {
      return { outcome: 'ALREADY_DEDUCTED', passName: null, remainingPasses: null };
    }
  }

  // Ugyanaz a kulcs már levont (pl. a foglalás sorának frissítése előtt megszakadt kérés).
  const operationKey = bookingOperationKey(booking);
  const replay = await tx.passUsageLog.findUnique({ where: { operationKey } });
  if (replay && !replay.reversedAt) {
    await tx.booking.update({ where: { id: booking.id }, data: { passUsageId: replay.id } });
    return { outcome: 'ALREADY_DEDUCTED', passName: null, remainingPasses: null };
  }

  if (input.kind === 'ARRIVED' && treatment.serviceId) {
    const sameDay = await tx.passUsageLog.findMany({
      where: {
        guestId: booking.guestId,
        serviceId: treatment.serviceId,
        delta: { lt: 0 },
        reversedAt: null,
        usedAt: { gte: input.dayStart, lt: input.dayEnd },
      },
      orderBy: { usedAt: 'asc' },
    });
    const manual = sameDay.filter((u) => !u.operationKey?.startsWith('booking:'));
    if (manual.length > 0) {
      const claimed = await tx.booking.findMany({
        where: { passUsageId: { in: manual.map((u) => u.id) } },
      });
      const free = manual.find((u) => !claimed.some((b) => b.passUsageId === u.id));
      if (free) {
        await tx.booking.update({ where: { id: booking.id }, data: { passUsageId: free.id } });
        return { outcome: 'LINKED_EXISTING', passName: null, remainingPasses: null };
      }
    }
  }

  const passes = await loadGuestPasses(tx, booking.guestId);
  const pass = pickBookingPass(passes, treatment.serviceId, now, input.guestGender);
  if (!pass) {
    // Lejárt, 0 alkalmas vagy hiányzó bérlet: nincs levonás és nincs automatikus tartozás.
    return { outcome: 'NO_USABLE_PASS', passName: null, remainingPasses: null };
  }

  const checkIn =
    input.kind === 'ARRIVED'
      ? await recordArrival(tx, {
          studioId: booking.studioId,
          guestId: booking.guestId,
          guestPassId: pass.id,
          staffUserId: input.staffUserId,
          visitType: 'TREATMENT',
          reason: `Foglalás: ${treatment.name}`,
        })
      : null;

  const { usageId, remaining } = await recordDeduction(
    tx,
    {
      id: pass.id,
      type: pass.row.type,
      remainingPasses: pass.remainingPasses ?? null,
      isActive: pass.row.isActive,
      cancelledAt: pass.row.cancelledAt,
    },
    {
      guestId: booking.guestId,
      staffUserId: input.staffUserId,
      checkInId: checkIn?.id ?? null,
      serviceId: treatment.serviceId,
      operationKey,
      note:
        input.kind === 'NO_SHOW'
          ? `Nem jelent meg (foglalás): ${treatment.name}`
          : `Foglalás: ${treatment.name}`,
      balanceChangedError: 'PASS.BALANCE_CHANGED',
    },
  );
  await tx.booking.update({ where: { id: booking.id }, data: { passUsageId: usageId } });
  return { outcome: 'DEDUCTED', passName: pass.name, remainingPasses: remaining };
}

/**
 * A foglalás levonásának visszavonása (állapot visszaállításakor): a foglalás saját levonása
 * jóváíródik és a beléptetés sztornózódik; a recepción, külön rögzített levonás csak leválik.
 */
export async function reverseForBooking(
  tx: Tx,
  input: { booking: Booking; staffUserId: string; reason: string; now: Date },
): Promise<DeductionResult> {
  const { booking, now } = input;
  if (!booking.passUsageId) return NO_DEDUCTION;
  const usage = await tx.passUsageLog.findUnique({ where: { id: booking.passUsageId } });
  let restored: number | 'Korlátlan' | null = null;
  if (usage && !usage.reversedAt && usage.operationKey?.startsWith('booking:')) {
    const guestPass = await tx.guestPass.findUnique({ where: { id: usage.guestPassId } });
    if (guestPass) {
      restored = await reverseDeduction(tx, { id: usage.id, guestPass }, input.reason, now);
    }
    if (usage.checkInId) {
      const checkIn = await tx.loggedCheckIn.findUnique({ where: { id: usage.checkInId } });
      if (checkIn) await voidArrival(tx, checkIn, `Foglalás visszaállítva: ${input.reason}`);
    }
    await logCorrection(tx, {
      studioId: booking.studioId,
      staffUserId: input.staffUserId,
      action: 'BOOKING_DEDUCTION_REVERSED',
      entityType: 'Booking',
      entityId: booking.id,
      details: `Foglalás levonása visszavonva: ${input.reason}`,
    });
  }
  await tx.booking.update({
    where: { id: booking.id },
    data: { passUsageId: null, deductionSeq: { increment: 1 } },
  });
  return { outcome: 'REVERSED', passName: null, remainingPasses: restored };
}
