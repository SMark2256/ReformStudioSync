import type {
  BookableTreatment,
  Booking,
  BookingResource,
  Prisma,
} from '@prisma/client';
import {
  addDaysToDayKey,
  appError,
  AppErrorCode,
  APP_ERROR_CATALOG,
  BookingContext,
  BookingDto,
  BookingPassWarning,
  BookingSettingsDto,
  BookingSource,
  BookingStatus,
  BookingWindowError,
  checkBookingWindow,
  checkChangeWindow,
  checkSequence,
  DEFAULT_BOOKING_SETTINGS,
  normalizeOpeningHours,
  OccupancyItem,
  orderTreatments,
  PlacementError,
  planItem,
  planSequence,
  PlannedItem,
  studioDateTime,
  toStudioDayKey,
} from '@reform/shared';
import { randomUUID } from 'crypto';
import { hashOpaqueToken, manageTokenFor } from './booking-tokens';
import { computePassWarnings } from './booking-passes';

/**
 * A foglalási motor (TICKET-57) tranzakción belüli lépései. A szabályokat a `@reform/shared`
 * tiszta függvényei döntik el; itt a zárolás, a kontextus betöltése és a sorok írása van.
 *
 * Párhuzamos foglalás: minden érintett gép sorát `SELECT … FOR UPDATE` zárja (azonosító szerinti
 * sorrendben, holtpont nélkül), és a vendég sorát is, a kapacitás- és önátfedés-ellenőrzés csak
 * ezután olvas. READ COMMITTED mellett a zár megszerzése után minden lekérdezés a másik,
 * már véglegesített tranzakció foglalását is látja, így a második kérés elutasítást kap.
 */

export type Tx = Prisma.TransactionClient;

export type TreatmentRow = BookableTreatment;
export type ResourceRow = BookingResource;
export type BookingRow = Booking;

export type BookingActor =
  | { kind: 'STAFF'; userId: string; override: boolean }
  | { kind: 'GUEST' };

const OPEN_BOOKING_STATUSES = ['CONFIRMED', 'LATE', 'ARRIVED', 'NO_SHOW'] as const;

export function actorOverride(actor: BookingActor): boolean {
  return actor.kind === 'STAFF' && actor.override;
}

export function actorUserId(actor: BookingActor): string | null {
  return actor.kind === 'STAFF' ? actor.userId : null;
}

// ---------------------------------------------------------------------------
// Hibák
// ---------------------------------------------------------------------------

const PLACEMENT_ERRORS: Record<PlacementError, AppErrorCode> = {
  CLOSED: 'BOOKING.CLOSED',
  OUTSIDE_OPENING_HOURS: 'BOOKING.OUTSIDE_OPENING_HOURS',
  RESOURCE_BLOCKED: 'BOOKING.RESOURCE_BLOCKED',
  CAPACITY_FULL: 'BOOKING.CAPACITY_FULL',
  GUEST_OVERLAP: 'BOOKING.GUEST_OVERLAP',
};

export function placementError(error: PlacementError, treatmentName?: string) {
  const code = PLACEMENT_ERRORS[error];
  return appError(code, {
    message: treatmentName
      ? `${treatmentName}: ${APP_ERROR_CATALOG[code].message}`
      : undefined,
    details: { reason: error },
  });
}

/** A beállított számokkal (nem a katalógus alapértékével) megfogalmazott időablak-hiba. */
export function windowError(
  error: BookingWindowError | 'CHANGE_CUTOFF',
  settings: BookingSettingsDto,
) {
  switch (error) {
    case 'IN_PAST':
      return appError('BOOKING.IN_PAST');
    case 'TOO_LATE':
      return appError('BOOKING.TOO_LATE', {
        message: `Online legalább ${settings.minLeadMinutes} perccel a kezdés előtt lehet foglalni.`,
      });
    case 'TOO_FAR':
      return appError('BOOKING.TOO_FAR', {
        message: `Legfeljebb ${settings.maxAdvanceDays} nappal előre lehet foglalni.`,
      });
    case 'CHANGE_CUTOFF':
      return appError('BOOKING.CHANGE_CUTOFF', {
        message: `Online módosítás és lemondás a kezdés előtt legalább ${settings.changeCutoffHours} órával lehetséges. Ezután a recepció tud segíteni.`,
      });
  }
}

// ---------------------------------------------------------------------------
// Beállítások, zárolás, kontextus
// ---------------------------------------------------------------------------

export async function loadBookingSettings(db: Tx, studioId: string): Promise<BookingSettingsDto> {
  const row = await db.bookingSettings.findUnique({ where: { studioId } });
  if (!row) return { ...DEFAULT_BOOKING_SETTINGS, locationText: '' };
  return {
    openingHours: normalizeOpeningHours(row.openingHours),
    maxAdvanceDays: row.maxAdvanceDays,
    minLeadMinutes: row.minLeadMinutes,
    changeCutoffHours: row.changeCutoffHours,
    holdMinutes: row.holdMinutes,
    slotStepMinutes: row.slotStepMinutes,
    locationText: row.locationText,
  };
}

/** A gépek sorainak zárolása azonosító szerinti sorrendben (holtpont nélkül). */
export async function lockResources(tx: Tx, resourceIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(resourceIds)].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "booking_resources" WHERE "id" = ${id} FOR UPDATE`;
  }
}

/** A vendég sora: ugyanannak a vendégnek párhuzamosan sem lehet átfedő kezelése. */
export async function lockGuest(tx: Tx, guestId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "guests" WHERE "id" = ${guestId} FOR UPDATE`;
}

export async function lockBooking(tx: Tx, bookingId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
}

/** A nap határai UTC-ben (a stúdió időzónájában éjféltől éjfélig). */
export function dayBounds(dayKey: string): { from: Date; to: Date } {
  return { from: studioDateTime(dayKey, 0), to: studioDateTime(addDaysToDayKey(dayKey, 1), 0) };
}

export interface LoadedContext {
  ctx: BookingContext;
  settings: BookingSettingsDto;
  resources: ResourceRow[];
  treatments: TreatmentRow[];
  bookings: BookingRow[];
}

/**
 * A foglaltság a `[from, to)` időszakra: nem lemondott foglalások, élő várólistás tartások,
 * zárvatartások és ünnepnap-felülírások. `guestId` esetén a vendég saját kezelései is.
 */
export async function loadContext(
  tx: Tx,
  studioId: string,
  from: Date,
  to: Date,
  now: Date,
  guestId?: string | null,
): Promise<LoadedContext> {
  const settings = await loadBookingSettings(tx, studioId);
  const [resources, treatments, overrides, closures, bookings, holds] = await Promise.all([
    tx.bookingResource.findMany({ where: { studioId }, orderBy: { sortOrder: 'asc' } }),
    tx.bookableTreatment.findMany({ where: { studioId }, orderBy: { sortOrder: 'asc' } }),
    tx.bookingHolidayOverride.findMany({
      where: { studioId, dayKey: { gte: toStudioDayKey(from), lte: toStudioDayKey(to) } },
    }),
    tx.bookingClosure.findMany({
      where: { studioId, startsAt: { lt: to }, endsAt: { gt: from } },
    }),
    tx.booking.findMany({
      where: {
        studioId,
        status: { in: [...OPEN_BOOKING_STATUSES] },
        startsAt: { lt: to },
        blockedUntil: { gt: from },
      },
      orderBy: { startsAt: 'asc' },
    }),
    tx.waitlistEntry.findMany({
      where: {
        studioId,
        status: 'OFFERED',
        offerExpiresAt: { gt: now },
        offerStartsAt: { lt: to },
      },
    }),
  ]);

  const treatmentsById = new Map(treatments.map((t) => [t.id, t]));
  const occupancy: OccupancyItem[] = bookings.map((b) => ({
    refId: b.id,
    resourceId: b.resourceId,
    startsAt: b.startsAt,
    blockedUntil: b.blockedUntil,
  }));
  for (const hold of holds) {
    const treatment = treatmentsById.get(hold.treatmentId);
    if (!treatment || !hold.offerStartsAt) continue;
    const item = planItem(treatment, hold.offerStartsAt);
    occupancy.push({
      refId: holdRefId(hold.id),
      resourceId: item.resourceId,
      startsAt: item.startsAt,
      blockedUntil: item.blockedUntil,
    });
  }

  let guestBusy: BookingContext['guestBusy'] = [];
  if (guestId) {
    // A vendég kezelései a teljes napon (a lekérdezett időszakon kívül is lóghatnak bele).
    const own = await tx.booking.findMany({
      where: {
        guestId,
        status: { in: [...OPEN_BOOKING_STATUSES] },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
    });
    guestBusy = own.map((b) => ({ refId: b.id, startsAt: b.startsAt, endsAt: b.endsAt }));
  }

  return {
    settings,
    resources,
    treatments,
    bookings,
    ctx: {
      settings,
      overrides: overrides.map((o) => ({ dayKey: o.dayKey, isOpen: o.isOpen })),
      closures: closures.map((c) => ({ startsAt: c.startsAt, endsAt: c.endsAt, resourceId: c.resourceId })),
      occupancy,
      guestBusy,
    },
  };
}

export function holdRefId(waitlistEntryId: string): string {
  return `hold:${waitlistEntryId}`;
}

// ---------------------------------------------------------------------------
// Létrehozás, áthelyezés, lemondás
// ---------------------------------------------------------------------------

export interface CreateGroupInput {
  studioId: string;
  guestId: string;
  guestGender: string | null;
  treatments: TreatmentRow[];
  startsAt: Date;
  actor: BookingActor;
  source: BookingSource;
  note?: string | null;
  /** A foglalást a saját várólistás tartása nem akadályozza. */
  excludeRefIds?: string[];
  /** Várólistás ajánlat elfogadása: az időablakot az ajánlat már ellenőrizte. */
  skipWindow?: boolean;
  tokenSecret: string;
  now: Date;
}

export interface CreatedGroup {
  groupId: string;
  bookings: BookingRow[];
  warnings: Map<string, BookingPassWarning | null>;
}

/**
 * Többkezeléses (vagy egy kezeléses) foglalás atomikusan: a kezelések a konfigurált
 * sorrendben egymás után, mindegyik a saját gépén. Bármelyik elem hibája a teljes foglalást
 * elutasítja; a kapacitás a recepciónak sem írható felül.
 */
export async function createBookingGroup(tx: Tx, input: CreateGroupInput): Promise<CreatedGroup> {
  if (input.treatments.length === 0) throw appError('BOOKING.NO_TREATMENTS');
  const ordered = orderTreatments(input.treatments);
  const items = planSequence(ordered, input.startsAt);

  const settings = await loadBookingSettings(tx, input.studioId);
  const timing = checkBookingWindow(
    input.startsAt,
    input.now,
    settings,
    actorOverride(input.actor) || input.skipWindow,
  );
  if (timing) throw windowError(timing, settings);

  await lockResources(tx, items.map((i) => i.resourceId));
  await lockGuest(tx, input.guestId);

  const dayKey = toStudioDayKey(input.startsAt);
  const { from, to } = dayBounds(dayKey);
  const loaded = await loadContext(tx, input.studioId, from, to, input.now, input.guestId);
  const resourcesById = new Map(loaded.resources.map((r) => [r.id, r]));
  const failure = checkSequence(items, resourcesById, loaded.ctx, input.excludeRefIds);
  if (failure) {
    throw placementError(failure.error, input.treatments.length > 1 ? ordered[failure.index].name : undefined);
  }

  const warnings = await computePassWarnings(tx, input.guestId, input.guestGender, ordered, input.now);
  const groupId = randomUUID();
  const bookings: BookingRow[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const treatment = ordered[index];
    const id = randomUUID();
    const created = await tx.booking.create({
      data: {
        id,
        studioId: input.studioId,
        groupId,
        guestId: input.guestId,
        treatmentId: treatment.id,
        resourceId: item.resourceId,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        blockedUntil: item.blockedUntil,
        status: 'CONFIRMED',
        source: input.source,
        note: input.note?.trim() || null,
        passWarning: warnings.get(treatment.id) ?? null,
        manageTokenHash: hashOpaqueToken(manageTokenFor(input.tokenSecret, id)),
        createdById: actorUserId(input.actor),
      },
    });
    bookings.push(created);
  }
  return { groupId, bookings, warnings };
}

export function assertChangeable(booking: BookingRow): void {
  if (booking.status === 'CANCELLED') throw appError('BOOKING.ALREADY_CANCELLED');
  if (booking.status !== 'CONFIRMED' && booking.status !== 'LATE') {
    throw appError('BOOKING.INVALID_STATUS_CHANGE', {
      message: 'Csak a még meg nem történt (visszaigazolt vagy késő) foglalás módosítható.',
    });
  }
}

/**
 * Áthelyezés: online a 24 órás szabály (a régi időponthoz) és az új időpont időablaka is
 * érvényes; a recepció felülírhatja. A saját foglalás a kapacitásban nem számít.
 */
export async function rescheduleBooking(
  tx: Tx,
  input: { booking: BookingRow; startsAt: Date; actor: BookingActor; now: Date },
): Promise<{ before: BookingRow; after: BookingRow }> {
  const { booking, actor, now } = input;
  assertChangeable(booking);
  const settings = await loadBookingSettings(tx, booking.studioId);
  const override = actorOverride(actor);
  const cutoff = checkChangeWindow(booking.startsAt, now, settings, override);
  if (cutoff) throw windowError(cutoff, settings);
  const timing = checkBookingWindow(input.startsAt, now, settings, override);
  if (timing) throw windowError(timing, settings);

  const treatment = await tx.bookableTreatment.findUnique({ where: { id: booking.treatmentId } });
  if (!treatment) throw appError('BOOKING.TREATMENT_NOT_FOUND');
  const item: PlannedItem = planItem(treatment, input.startsAt);

  await lockResources(tx, [item.resourceId]);
  await lockGuest(tx, booking.guestId);
  const { from, to } = dayBounds(toStudioDayKey(input.startsAt));
  const loaded = await loadContext(tx, booking.studioId, from, to, now, booking.guestId);
  const resource = loaded.resources.find((r) => r.id === item.resourceId);
  if (!resource) throw appError('BOOKING.TREATMENT_NOT_FOUND');
  const failure = checkSequence([item], new Map([[resource.id, resource]]), loaded.ctx, [booking.id]);
  if (failure) throw placementError(failure.error);

  const after = await tx.booking.update({
    where: { id: booking.id },
    data: {
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      blockedUntil: item.blockedUntil,
      resourceId: item.resourceId,
      // Az új időponthoz új emlékeztető jár.
      reminderSentAt: null,
      reminderAttempts: 0,
    },
  });
  return { before: booking, after };
}

/** Lemondás: online a 24 órás szabállyal, a recepció felülírhatja. A többi foglalás marad. */
export async function cancelBooking(
  tx: Tx,
  input: { booking: BookingRow; actor: BookingActor; reason?: string | null; now: Date },
): Promise<BookingRow> {
  const { booking, actor, now } = input;
  assertChangeable(booking);
  const settings = await loadBookingSettings(tx, booking.studioId);
  const cutoff = checkChangeWindow(booking.startsAt, now, settings, actorOverride(actor));
  if (cutoff) throw windowError(cutoff, settings);

  // Feltételes frissítés: párhuzamos lemondás vagy állapotváltás nem írja felül egymást.
  const { count } = await tx.booking.updateMany({
    where: { id: booking.id, status: { in: ['CONFIRMED', 'LATE'] } },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      cancelReason: input.reason?.trim() || (actor.kind === 'GUEST' ? 'Online lemondás' : null),
    },
  });
  if (count !== 1) throw appError('BOOKING.ALREADY_CANCELLED');
  const updated = await tx.booking.findUnique({ where: { id: booking.id } });
  return updated ?? booking;
}

/** Auditnapló: ki (munkatárs, vagy `null`: a vendég online), mikor, mit. */
export function logBookingAudit(
  tx: Tx,
  data: {
    studioId: string;
    userId: string | null;
    action: string;
    entityType?: string;
    entityId: string;
    details: string;
  },
) {
  return tx.auditLog.create({
    data: {
      studioId: data.studioId,
      userId: data.userId,
      action: data.action,
      entityType: data.entityType ?? 'Booking',
      entityId: data.entityId,
      details: data.details,
    },
  });
}

// ---------------------------------------------------------------------------
// Megjelenítés
// ---------------------------------------------------------------------------

/** Foglalássorok DTO-ja; a kapcsolt adatok külön lekérdezésekből (nincs mély `include`). */
export async function toBookingDtos(db: Tx, rows: readonly BookingRow[]): Promise<BookingDto[]> {
  if (rows.length === 0) return [];
  const unique = <T>(values: T[]) => [...new Set(values)];
  const usageIds = unique(rows.map((r) => r.passUsageId).filter((id): id is string => !!id));
  const [guests, treatments, resources, usages] = await Promise.all([
    db.guest.findMany({ where: { id: { in: unique(rows.map((r) => r.guestId)) } } }),
    db.bookableTreatment.findMany({ where: { id: { in: unique(rows.map((r) => r.treatmentId)) } } }),
    db.bookingResource.findMany({ where: { id: { in: unique(rows.map((r) => r.resourceId)) } } }),
    usageIds.length > 0
      ? db.passUsageLog.findMany({ where: { id: { in: usageIds } } })
      : Promise.resolve([]),
  ]);
  const guestById = new Map(guests.map((g) => [g.id, g]));
  const treatmentById = new Map(treatments.map((t) => [t.id, t]));
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const usageById = new Map(usages.map((u) => [u.id, u]));

  return rows.map((b) => {
    const guest = guestById.get(b.guestId);
    const usage = b.passUsageId ? usageById.get(b.passUsageId) : undefined;
    return {
      id: b.id,
      groupId: b.groupId,
      guestId: b.guestId,
      guestName: guest ? `${guest.lastName} ${guest.firstName}` : 'Ismeretlen vendég',
      guestPhone: guest?.phone ?? null,
      guestEmail: guest?.email ?? null,
      guestBarcode: guest?.barcode ?? '',
      treatmentId: b.treatmentId,
      treatmentName: treatmentById.get(b.treatmentId)?.name ?? 'Kezelés',
      resourceId: b.resourceId,
      resourceName: resourceById.get(b.resourceId)?.name ?? 'Gép',
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      blockedUntil: b.blockedUntil.toISOString(),
      status: b.status as unknown as BookingStatus,
      source: b.source as unknown as BookingSource,
      passWarning: (b.passWarning as BookingPassWarning | null) ?? null,
      deducted: Boolean(usage && !usage.reversedAt),
      passUsageId: b.passUsageId,
      note: b.note,
      cancelledAt: b.cancelledAt?.toISOString() ?? null,
      cancelReason: b.cancelReason,
      createdAt: b.createdAt.toISOString(),
    };
  });
}
