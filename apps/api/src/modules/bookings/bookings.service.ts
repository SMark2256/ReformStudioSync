import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  appError,
  BOOKING_STATUS_LABELS,
  BookableTreatmentDto,
  BookingAuditEntryDto,
  BookingAvailabilityDto,
  BookingCalendarDto,
  BookingClosureDto,
  BookingDayDto,
  BookingDto,
  BookingSettingsBundleDto,
  BookingSettingsDto,
  BookingSource,
  bookingsAffectedByClosure,
  bookingTransition,
  BookingStatusValue,
  CreateBookingResponseDto,
  CreateClosureResponseDto,
  dayKeysBetween,
  findSequenceSlots,
  HolidayOverrideDto,
  hungarianPublicHolidays,
  isDayKey,
  normalizeOpeningHours,
  planItem,
  resolveDayHours,
  toStudioDayKey,
  UpdateBookingStatusResponseDto,
  type HolidayOverrideInput,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { guestTokenSecret } from './booking-config';
import {
  BookingActor,
  cancelBooking,
  createBookingGroup,
  dayBounds,
  loadBookingSettings,
  loadContext,
  lockBooking,
  logBookingAudit,
  rescheduleBooking,
  ResourceRow,
  toBookingDtos,
  TreatmentRow,
  Tx,
} from './booking-engine';
import { BookingEvents } from './booking-events';
import { BookingNotificationsService } from './booking-notifications.service';
import { deductForBooking, DeductionResult, reverseForBooking } from './booking-passes';
import { CalendarSyncService } from './calendar-sync.service';
import { WaitlistService } from './waitlist.service';
import type {
  CancelBookingDto,
  CreateClosureDto,
  CreateStaffBookingDto,
  RescheduleBookingDto,
  UpdateBookingSettingsDto,
  UpdateBookingStatusDto,
  UpsertHolidayOverrideDto,
} from './bookings.dto';

/** A recepciós naptár egyszerre legfeljebb ennyi napot kér le. */
const MAX_CALENDAR_DAYS = 31;

export interface AvailabilityQuery {
  studioId: string;
  dayKey: string;
  treatmentIds: string[];
  guestId?: string | null;
  override?: boolean;
  /** Csak az online foglalható kezelések (nyilvános foglaló). */
  onlineOnly?: boolean;
  excludeBookingIds?: string[];
}

export function toTreatmentDto(t: TreatmentRow, resources: readonly ResourceRow[]): BookableTreatmentDto {
  return {
    id: t.id,
    name: t.name,
    resourceId: t.resourceId,
    resourceName: resources.find((r) => r.id === t.resourceId)?.name ?? 'Gép',
    serviceId: t.serviceId,
    durationMinutes: t.durationMinutes,
    bufferMinutes: t.bufferMinutes,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    isOnline: t.isOnline,
  };
}

function toResourceDto(r: ResourceRow) {
  return { id: r.id, name: r.name, capacity: r.capacity, isActive: r.isActive, sortOrder: r.sortOrder };
}

function toDayDto(dayKey: string, settings: BookingSettingsDto, overrides: readonly HolidayOverrideInput[]): BookingDayDto {
  const day = resolveDayHours(dayKey, settings, overrides);
  return { dayKey, hours: day.hours, closedReason: day.closedReason, holidayName: day.holidayName };
}

/**
 * Recepciós foglalási műveletek (TICKET-57): naptár, foglalás, áthelyezés, lemondás, állapot
 * és bérletlevonás, beállítások, zárvatartás. A szabályokat a motor (`booking-engine`) és a
 * `@reform/shared` tiszta függvényei döntik el. Minden lényeges művelet az auditnaplóba kerül;
 * a levél, a várólista és a valós idejű jelzés a commit után fut.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: BookingNotificationsService,
    private readonly calendarSync: CalendarSyncService,
    private readonly waitlist: WaitlistService,
    private readonly events: BookingEvents,
    private readonly config: ConfigService,
  ) {}

  private get tokenSecret(): string {
    return guestTokenSecret(this.config);
  }

  /** Utólagos lépés hibája (levél, várólista) a már véglegesített foglalást nem érinti. */
  private background(label: string, task: Promise<unknown>): void {
    task.catch((err) => this.logger.error(`${label} sikertelen`, err as Error));
  }

  private releaseCapacity(studioId: string, resourceId: string, at: Date): void {
    this.background(
      'Várólistás ajánlat',
      this.waitlist.offerReleased(studioId, resourceId, toStudioDayKey(at)),
    );
  }

  // -------------------------------------------------------------------------
  // Naptár és szabad időpontok
  // -------------------------------------------------------------------------

  async calendar(studioId: string, fromKey: string, toKey: string, now: Date = new Date()): Promise<BookingCalendarDto> {
    if (!isDayKey(fromKey) || !isDayKey(toKey) || toKey < fromKey) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes időszakot adj meg (ÉÉÉÉ-HH-NN).' });
    }
    const dayKeys = dayKeysBetween(fromKey, toKey);
    if (dayKeys.length > MAX_CALENDAR_DAYS) {
      throw appError('COMMON.VALIDATION_FAILED', { message: `Legfeljebb ${MAX_CALENDAR_DAYS} nap kérhető le egyszerre.` });
    }
    const from = dayBounds(fromKey).from;
    const to = dayBounds(toKey).to;
    const loaded = await loadContext(this.prisma, studioId, from, to, now);
    const [closures, holds] = await Promise.all([
      this.prisma.bookingClosure.findMany({
        where: { studioId, startsAt: { lt: to }, endsAt: { gt: from } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.waitlistEntry.findMany({
        where: { studioId, status: 'OFFERED', offerExpiresAt: { gt: now }, offerStartsAt: { gte: from, lt: to } },
      }),
    ]);
    const holdGuests = holds.length
      ? await this.prisma.guest.findMany({ where: { id: { in: holds.map((h) => h.guestId) } } })
      : [];

    return {
      from: fromKey,
      to: toKey,
      days: dayKeys.map((key) => toDayDto(key, loaded.settings, loaded.ctx.overrides)),
      resources: loaded.resources.map(toResourceDto),
      treatments: loaded.treatments.map((t) => toTreatmentDto(t, loaded.resources)),
      bookings: await toBookingDtos(this.prisma, loaded.bookings),
      closures: this.toClosureDtos(closures, loaded.resources),
      holds: holds.flatMap((h) => {
        const treatment = loaded.treatments.find((t) => t.id === h.treatmentId);
        if (!treatment || !h.offerStartsAt || !h.offerExpiresAt) return [];
        const guest = holdGuests.find((g) => g.id === h.guestId);
        const item = planItem(treatment, h.offerStartsAt);
        return [
          {
            waitlistEntryId: h.id,
            resourceId: treatment.resourceId,
            treatmentName: treatment.name,
            guestName: guest ? `${guest.lastName} ${guest.firstName}` : 'Várólistás vendég',
            startsAt: item.startsAt.toISOString(),
            blockedUntil: item.blockedUntil.toISOString(),
            expiresAt: h.offerExpiresAt.toISOString(),
          },
        ];
      }),
    };
  }

  /** Szabad (többkezeléses) időpontok egy napra; a recepció és a nyilvános foglaló is ezt hívja. */
  async availability(query: AvailabilityQuery, now: Date = new Date()): Promise<BookingAvailabilityDto> {
    if (!isDayKey(query.dayKey)) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes napot adj meg (ÉÉÉÉ-HH-NN).' });
    }
    const { from, to } = dayBounds(query.dayKey);
    const loaded = await loadContext(this.prisma, query.studioId, from, to, now, query.guestId);
    const treatments = this.pickTreatments(loaded.treatments, query.treatmentIds, query.onlineOnly);
    const day = toDayDto(query.dayKey, loaded.settings, loaded.ctx.overrides);
    const names = new Map(treatments.map((t) => [t.id, t.name]));
    const slots = findSequenceSlots({
      dayKey: query.dayKey,
      treatments,
      resources: loaded.resources,
      ctx: loaded.ctx,
      now,
      override: query.override,
      excludeRefIds: query.excludeBookingIds,
    });
    return {
      dayKey: query.dayKey,
      day,
      slots: slots.map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        remaining: s.remaining,
        items: s.items.map((i) => ({
          treatmentId: i.treatmentId,
          treatmentName: names.get(i.treatmentId) ?? 'Kezelés',
          resourceId: i.resourceId,
          startsAt: i.startsAt.toISOString(),
          endsAt: i.endsAt.toISOString(),
        })),
      })),
    };
  }

  pickTreatments(all: readonly TreatmentRow[], ids: readonly string[], onlineOnly = false): TreatmentRow[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) throw appError('BOOKING.NO_TREATMENTS');
    return unique.map((id) => {
      const treatment = all.find((t) => t.id === id && t.isActive && (!onlineOnly || t.isOnline));
      if (!treatment) throw appError('BOOKING.TREATMENT_NOT_FOUND');
      return treatment;
    });
  }

  // -------------------------------------------------------------------------
  // Foglalás, áthelyezés, lemondás
  // -------------------------------------------------------------------------

  async create(
    studioId: string,
    dto: CreateStaffBookingDto,
    staffUserId: string,
    now: Date = new Date(),
  ): Promise<CreateBookingResponseDto> {
    const startsAt = new Date(dto.startsAt);
    const actor: BookingActor = { kind: 'STAFF', userId: staffUserId, override: Boolean(dto.overrideRules) };
    const created = await this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findFirst({ where: { id: dto.guestId, studioId, isActive: true } });
      if (!guest) throw appError('GUEST.NOT_FOUND');
      const all = await tx.bookableTreatment.findMany({ where: { studioId } });
      const treatments = this.pickTreatments(all, dto.treatmentIds);
      const group = await createBookingGroup(tx, {
        studioId,
        guestId: guest.id,
        guestGender: guest.gender,
        treatments,
        startsAt,
        actor,
        source: BookingSource.RECEPTION,
        note: dto.note,
        tokenSecret: this.tokenSecret,
        now,
      });
      const ids = group.bookings.map((b) => b.id);
      await this.calendarSync.enqueue(tx, studioId, ids, 'UPSERT');
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_CREATED',
        entityId: group.groupId,
        entityType: 'BookingGroup',
        details: `${guest.lastName} ${guest.firstName}: ${treatments.map((t) => t.name).join(', ')}, ${startsAt.toISOString()}${dto.overrideRules ? ' (időkorlát felülírva)' : ''}`,
      });
      return { group, treatments, bookings: await toBookingDtos(tx, group.bookings) };
    });

    this.background('Visszaigazolás', this.notifications.sendConfirmation(created.bookings.map((b) => b.id)));
    this.events.changed(studioId, 'CREATED', [startsAt]);
    return {
      groupId: created.group.groupId,
      bookings: created.bookings,
      warnings: created.treatments.flatMap((t) => {
        const warning = created.group.warnings.get(t.id);
        return warning ? [{ treatmentId: t.id, treatmentName: t.name, warning }] : [];
      }),
    };
  }

  private async findBooking(tx: Tx, studioId: string, bookingId: string) {
    const booking = await tx.booking.findFirst({ where: { id: bookingId, studioId } });
    if (!booking) throw appError('BOOKING.NOT_FOUND');
    return booking;
  }

  async reschedule(
    studioId: string,
    bookingId: string,
    dto: RescheduleBookingDto,
    staffUserId: string,
    now: Date = new Date(),
  ): Promise<BookingDto> {
    const startsAt = new Date(dto.startsAt);
    const result = await this.prisma.$transaction(async (tx) => {
      await lockBooking(tx, bookingId);
      const booking = await this.findBooking(tx, studioId, bookingId);
      const moved = await rescheduleBooking(tx, {
        booking,
        startsAt,
        actor: { kind: 'STAFF', userId: staffUserId, override: Boolean(dto.overrideRules) },
        now,
      });
      await this.calendarSync.enqueue(tx, studioId, [booking.id], 'UPSERT');
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_RESCHEDULED',
        entityId: booking.id,
        details: `${booking.startsAt.toISOString()} → ${moved.after.startsAt.toISOString()}${dto.overrideRules ? ' (időkorlát felülírva)' : ''}`,
      });
      return moved;
    });

    this.background('Módosítási levél', this.notifications.sendRescheduled(bookingId));
    this.releaseCapacity(studioId, result.before.resourceId, result.before.startsAt);
    this.events.changed(studioId, 'RESCHEDULED', [result.before.startsAt, result.after.startsAt]);
    const [moved] = await toBookingDtos(this.prisma, [result.after]);
    return moved;
  }

  async cancel(
    studioId: string,
    bookingId: string,
    dto: CancelBookingDto,
    staffUserId: string,
    now: Date = new Date(),
  ): Promise<BookingDto> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      await lockBooking(tx, bookingId);
      const booking = await this.findBooking(tx, studioId, bookingId);
      const updated = await cancelBooking(tx, {
        booking,
        // A recepción a lemondás a recepciós döntése: a 24 órás szabály alapból nem köti.
        actor: { kind: 'STAFF', userId: staffUserId, override: dto.overrideRules ?? true },
        reason: dto.reason,
        now,
      });
      await this.calendarSync.enqueue(tx, studioId, [booking.id], 'DELETE');
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_CANCELLED',
        entityId: booking.id,
        details: `Lemondva a recepción${dto.reason ? `: ${dto.reason.trim()}` : ''}`,
      });
      return updated;
    });

    this.background('Lemondási levél', this.notifications.sendCancelled(bookingId));
    this.releaseCapacity(studioId, cancelled.resourceId, cancelled.startsAt);
    this.events.changed(studioId, 'CANCELLED', [cancelled.startsAt]);
    const [result] = await toBookingDtos(this.prisma, [cancelled]);
    return result;
  }

  /**
   * Állapotváltás (megérkezett / késik / nem jelent meg / visszaállítás). Megérkezéskor és
   * „Nem jelent meg”-nél pontosan egy levonás; visszaállításkor a levonás visszavonása.
   * Automatikus „nem jelent meg” nincs: csak a recepciós rögzíti.
   */
  async setStatus(
    studioId: string,
    bookingId: string,
    dto: UpdateBookingStatusDto,
    staffUserId: string,
    now: Date = new Date(),
  ): Promise<UpdateBookingStatusResponseDto> {
    const target = dto.status as BookingStatusValue;
    if (target === 'CANCELLED') {
      throw appError('BOOKING.INVALID_STATUS_CHANGE', { message: 'Lemondáshoz a Lemondás műveletet használd.' });
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await lockBooking(tx, bookingId);
      const booking = await this.findBooking(tx, studioId, bookingId);
      const from = booking.status as BookingStatusValue;
      const transition = bookingTransition(from, target);
      if (!transition.allowed) {
        throw appError(from === 'CANCELLED' ? 'BOOKING.ALREADY_CANCELLED' : 'BOOKING.INVALID_STATUS_CHANGE');
      }
      const [treatment, guest] = await Promise.all([
        tx.bookableTreatment.findUnique({ where: { id: booking.treatmentId } }),
        tx.guest.findUnique({ where: { id: booking.guestId } }),
      ]);
      if (!treatment || !guest) throw appError('BOOKING.NOT_FOUND');

      let deduction: DeductionResult = { outcome: 'NONE', passName: null, remainingPasses: null };
      if (transition.reverse) {
        deduction = await reverseForBooking(tx, {
          booking,
          staffUserId,
          reason: dto.reason?.trim() || 'Állapot visszaállítva',
          now,
        });
      }
      if (transition.deduct) {
        const { from: dayStart, to: dayEnd } = dayBounds(toStudioDayKey(booking.startsAt));
        deduction = await deductForBooking(tx, {
          booking,
          treatment,
          kind: target === 'NO_SHOW' ? 'NO_SHOW' : 'ARRIVED',
          staffUserId,
          guestGender: guest.gender,
          dayStart,
          dayEnd,
          now,
        });
      }

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: target,
          arrivedAt: target === 'ARRIVED' ? (booking.arrivedAt ?? now) : null,
          noShowAt: target === 'NO_SHOW' ? (booking.noShowAt ?? now) : null,
        },
      });
      await this.calendarSync.enqueue(tx, studioId, [booking.id], 'UPSERT');
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: `BOOKING_STATUS_${target}`,
        entityId: booking.id,
        details: `${treatment.name}: ${BOOKING_STATUS_LABELS[from]} → ${BOOKING_STATUS_LABELS[target]}; bérlet: ${deduction.outcome}${dto.reason ? `; ${dto.reason.trim()}` : ''}`,
      });
      return { updated, deduction };
    });

    this.events.changed(studioId, 'STATUS', [result.updated.startsAt]);
    const [booking] = await toBookingDtos(this.prisma, [result.updated]);
    return {
      booking,
      deduction: result.deduction.outcome,
      passName: result.deduction.passName,
      remainingPasses: result.deduction.remainingPasses,
    };
  }

  async audit(studioId: string, bookingId: string): Promise<BookingAuditEntryDto[]> {
    const booking = await this.findBooking(this.prisma, studioId, bookingId);
    const logs = await this.prisma.auditLog.findMany({
      where: { studioId, entityId: { in: [booking.id, booking.groupId] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } } }) : [];
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      userName: l.userId ? (users.find((u) => u.id === l.userId)?.name ?? null) : null,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  // -------------------------------------------------------------------------
  // Beállítások
  // -------------------------------------------------------------------------

  private toClosureDtos(
    closures: { id: string; startsAt: Date; endsAt: Date; resourceId: string | null; reason: string | null; createdAt: Date }[],
    resources: readonly ResourceRow[],
  ): BookingClosureDto[] {
    return closures.map((c) => ({
      id: c.id,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      resourceId: c.resourceId,
      resourceName: c.resourceId ? (resources.find((r) => r.id === c.resourceId)?.name ?? null) : null,
      reason: c.reason,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async settingsBundle(studioId: string, now: Date = new Date()): Promise<BookingSettingsBundleDto> {
    const today = toStudioDayKey(now);
    const [settings, resources, treatments, closures, overrides] = await Promise.all([
      loadBookingSettings(this.prisma, studioId),
      this.prisma.bookingResource.findMany({ where: { studioId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.bookableTreatment.findMany({ where: { studioId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.bookingClosure.findMany({
        where: { studioId, endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.bookingHolidayOverride.findMany({
        where: { studioId, dayKey: { gte: today } },
        orderBy: { dayKey: 'asc' },
      }),
    ]);
    const year = Number(today.slice(0, 4));
    const holidays = [...hungarianPublicHolidays(year), ...hungarianPublicHolidays(year + 1)]
      .filter((h) => h.dayKey >= today)
      .map((h) => ({
        dayKey: h.dayKey,
        name: h.name,
        isOpen: overrides.find((o) => o.dayKey === h.dayKey)?.isOpen ?? false,
      }));
    return {
      settings,
      resources: resources.map(toResourceDto),
      treatments: treatments.map((t) => toTreatmentDto(t, resources)),
      closures: this.toClosureDtos(closures, resources),
      holidayOverrides: overrides.map(
        (o): HolidayOverrideDto => ({ id: o.id, dayKey: o.dayKey, isOpen: o.isOpen, note: o.note }),
      ),
      holidays,
    };
  }

  async updateSettings(studioId: string, dto: UpdateBookingSettingsDto, staffUserId: string): Promise<BookingSettingsDto> {
    const current = await loadBookingSettings(this.prisma, studioId);
    const openingHours = dto.openingHours ? normalizeOpeningHours(dto.openingHours) : current.openingHours;
    const data = {
      openingHours: openingHours as unknown as Prisma.InputJsonValue,
      maxAdvanceDays: dto.maxAdvanceDays ?? current.maxAdvanceDays,
      minLeadMinutes: dto.minLeadMinutes ?? current.minLeadMinutes,
      changeCutoffHours: dto.changeCutoffHours ?? current.changeCutoffHours,
      holdMinutes: dto.holdMinutes ?? current.holdMinutes,
      slotStepMinutes: dto.slotStepMinutes ?? current.slotStepMinutes,
      locationText: dto.locationText?.trim() ?? current.locationText,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSettings.upsert({ where: { studioId }, update: data, create: { studioId, ...data } });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_SETTINGS_UPDATED',
        entityType: 'BookingSettings',
        entityId: studioId,
        details: JSON.stringify({ ...data, openingHours }),
      });
    });
    this.events.changed(studioId, 'SETTINGS');
    return loadBookingSettings(this.prisma, studioId);
  }

  /** A többkezeléses foglalás sorrendje: a lista sorrendje lesz a `sortOrder`. */
  async reorderTreatments(studioId: string, treatmentIds: string[], staffUserId: string): Promise<BookableTreatmentDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const all = await tx.bookableTreatment.findMany({ where: { studioId } });
      const ordered = [...new Set(treatmentIds)].filter((id) => all.some((t) => t.id === id));
      const rest = all.filter((t) => !ordered.includes(t.id)).sort((a, b) => a.sortOrder - b.sortOrder);
      const final = [...ordered, ...rest.map((t) => t.id)];
      for (let index = 0; index < final.length; index++) {
        await tx.bookableTreatment.update({ where: { id: final[index] }, data: { sortOrder: index + 1 } });
      }
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_TREATMENT_ORDER_UPDATED',
        entityType: 'BookableTreatment',
        entityId: studioId,
        details: final.map((id) => all.find((t) => t.id === id)?.name).join(' → '),
      });
    });
    this.events.changed(studioId, 'SETTINGS');
    return (await this.settingsBundle(studioId)).treatments;
  }

  async updateTreatment(
    studioId: string,
    treatmentId: string,
    dto: { isActive?: boolean; isOnline?: boolean },
    staffUserId: string,
  ): Promise<BookableTreatmentDto> {
    const treatment = await this.prisma.bookableTreatment.findFirst({ where: { id: treatmentId, studioId } });
    if (!treatment) throw appError('BOOKING.TREATMENT_NOT_FOUND');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookableTreatment.update({
        where: { id: treatment.id },
        data: { isActive: dto.isActive ?? treatment.isActive, isOnline: dto.isOnline ?? treatment.isOnline },
      });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_TREATMENT_UPDATED',
        entityType: 'BookableTreatment',
        entityId: treatment.id,
        details: `${treatment.name}: aktív ${row.isActive ? 'igen' : 'nem'}, online ${row.isOnline ? 'igen' : 'nem'}`,
      });
      return row;
    });
    const resources = await this.prisma.bookingResource.findMany({ where: { studioId } });
    this.events.changed(studioId, 'SETTINGS');
    return toTreatmentDto(updated, resources);
  }

  /** A gép teljes letiltása (határozatlan ideig); időszakos letiltás: zárvatartás géppel. */
  async updateResource(studioId: string, resourceId: string, isActive: boolean, staffUserId: string) {
    const resource = await this.prisma.bookingResource.findFirst({ where: { id: resourceId, studioId } });
    if (!resource) throw appError('COMMON.NOT_FOUND', { message: 'A gép nem található.' });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookingResource.update({ where: { id: resource.id }, data: { isActive } });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: isActive ? 'BOOKING_RESOURCE_ENABLED' : 'BOOKING_RESOURCE_DISABLED',
        entityType: 'BookingResource',
        entityId: resource.id,
        details: `${resource.name} ${isActive ? 'engedélyezve' : 'letiltva'}`,
      });
      return row;
    });
    this.events.changed(studioId, 'SETTINGS');
    return toResourceDto(updated);
  }

  /**
   * Rendkívüli zárvatartás vagy gépletiltás. A meglévő foglalásokat NEM módosítja: csak
   * visszaadja az érintetteket, a recepciós intézi az áthelyezést és a vendég értesítését.
   */
  async createClosure(studioId: string, dto: CreateClosureDto, staffUserId: string): Promise<CreateClosureResponseDto> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(endsAt > startsAt)) throw appError('BOOKING.CLOSURE_INVALID');
    const resourceId = dto.resourceId || null;
    const resources = await this.prisma.bookingResource.findMany({ where: { studioId } });
    if (resourceId && !resources.some((r) => r.id === resourceId)) {
      throw appError('COMMON.NOT_FOUND', { message: 'A gép nem található.' });
    }

    const { closure, affected } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bookingClosure.create({
        data: { studioId, resourceId, startsAt, endsAt, reason: dto.reason?.trim() || null, createdById: staffUserId },
      });
      const overlapping = await tx.booking.findMany({
        where: {
          studioId,
          status: { in: ['CONFIRMED', 'LATE', 'ARRIVED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          blockedUntil: { gt: startsAt },
        },
        orderBy: { startsAt: 'asc' },
      });
      const hit = bookingsAffectedByClosure(overlapping, { startsAt, endsAt, resourceId });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: resourceId ? 'BOOKING_RESOURCE_BLOCKED' : 'BOOKING_CLOSURE_CREATED',
        entityType: 'BookingClosure',
        entityId: created.id,
        details: `${startsAt.toISOString()} – ${endsAt.toISOString()}${resourceId ? ` (${resources.find((r) => r.id === resourceId)?.name})` : ''}; érintett foglalás: ${hit.length}`,
      });
      return { closure: created, affected: hit };
    });

    this.events.changed(studioId, 'SETTINGS', dayKeysBetween(toStudioDayKey(startsAt), toStudioDayKey(endsAt)));
    return {
      closure: this.toClosureDtos([closure], resources)[0],
      affectedBookings: await toBookingDtos(this.prisma, affected),
    };
  }

  async deleteClosure(studioId: string, closureId: string, staffUserId: string): Promise<{ deletedId: string }> {
    const closure = await this.prisma.bookingClosure.findFirst({ where: { id: closureId, studioId } });
    if (!closure) throw appError('BOOKING.CLOSURE_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingClosure.delete({ where: { id: closure.id } });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_CLOSURE_DELETED',
        entityType: 'BookingClosure',
        entityId: closure.id,
        details: `${closure.startsAt.toISOString()} – ${closure.endsAt.toISOString()}`,
      });
    });
    // A felszabadult időszak a várólistásoké lehet.
    const resources = closure.resourceId
      ? [closure.resourceId]
      : (await this.prisma.bookingResource.findMany({ where: { studioId } })).map((r) => r.id);
    for (const dayKey of dayKeysBetween(toStudioDayKey(closure.startsAt), toStudioDayKey(closure.endsAt))) {
      for (const resourceId of resources) {
        this.background('Várólistás ajánlat', this.waitlist.offerReleased(studioId, resourceId, dayKey));
      }
    }
    this.events.changed(studioId, 'SETTINGS', [closure.startsAt, closure.endsAt]);
    return { deletedId: closure.id };
  }

  async upsertHolidayOverride(studioId: string, dto: UpsertHolidayOverrideDto, staffUserId: string): Promise<HolidayOverrideDto> {
    if (!isDayKey(dto.dayKey)) throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes napot adj meg.' });
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.bookingHolidayOverride.upsert({
        where: { studioId_dayKey: { studioId, dayKey: dto.dayKey } },
        update: { isOpen: dto.isOpen, note: dto.note?.trim() || null },
        create: { studioId, dayKey: dto.dayKey, isOpen: dto.isOpen, note: dto.note?.trim() || null },
      });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_HOLIDAY_OVERRIDE',
        entityType: 'BookingHolidayOverride',
        entityId: saved.id,
        details: `${dto.dayKey}: ${dto.isOpen ? 'nyitva' : 'zárva'}`,
      });
      return saved;
    });
    this.events.changed(studioId, 'SETTINGS', [dto.dayKey]);
    return { id: row.id, dayKey: row.dayKey, isOpen: row.isOpen, note: row.note };
  }

  async deleteHolidayOverride(studioId: string, dayKey: string, staffUserId: string): Promise<{ dayKey: string }> {
    const existing = await this.prisma.bookingHolidayOverride.findFirst({ where: { studioId, dayKey } });
    if (!existing) return { dayKey };
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingHolidayOverride.delete({ where: { id: existing.id } });
      await logBookingAudit(tx, {
        studioId,
        userId: staffUserId,
        action: 'BOOKING_HOLIDAY_OVERRIDE_REMOVED',
        entityType: 'BookingHolidayOverride',
        entityId: existing.id,
        details: `${dayKey}: alapértelmezett nyitvatartás`,
      });
    });
    this.events.changed(studioId, 'SETTINGS', [dayKey]);
    return { dayKey };
  }

  /** A mai naptól a várólista (a recepciós lista). */
  waitlistFrom(studioId: string, now: Date = new Date()) {
    return this.waitlist.listForStaff(studioId, toStudioDayKey(now));
  }
}
