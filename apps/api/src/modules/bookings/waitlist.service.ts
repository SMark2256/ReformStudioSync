import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WaitlistEntry } from '@prisma/client';
import {
  appError,
  BookingSource,
  changeDeadline,
  findSequenceSlots,
  isDayKey,
  PublicCreatedBookingDto,
  PublicWaitlistOfferDto,
  studioMinutesOfDay,
  toStudioDayKey,
  WaitlistEntryDto,
  WaitlistStatus,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { guestTokenSecret } from './booking-config';
import {
  createBookingGroup,
  dayBounds,
  holdRefId,
  loadBookingSettings,
  loadContext,
  lockResources,
  logBookingAudit,
} from './booking-engine';
import { BookingEvents } from './booking-events';
import { BookingNotificationsService } from './booking-notifications.service';
import { createRandomToken, hashOpaqueToken, isWellFormedToken, manageTokenFor } from './booking-tokens';
import { CalendarSyncService } from './calendar-sync.service';

export interface JoinWaitlistInput {
  studioId: string;
  guestId: string;
  treatmentId: string;
  dayKey: string;
  fromMinutes: number;
  toMinutes: number;
  actorUserId: string | null;
}

/**
 * Várólista (TICKET-57). Felszabaduláskor (lemondás, áthelyezés, lejárt vagy elutasított
 * ajánlat) a legrégebben várakozó, megfelelő vendég kap levelet és kizárólagos tartást
 * (`OFFERED`, `holdMinutes` percig a kapacitásba számít). Az ajánlatkeresés ugyanazt a
 * gépzárat használja, mint a foglalás, így párhuzamos foglalással sem ütközik.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: BookingNotificationsService,
    private readonly calendarSync: CalendarSyncService,
    private readonly events: BookingEvents,
    private readonly config: ConfigService,
  ) {}

  async join(input: JoinWaitlistInput, now: Date = new Date()): Promise<WaitlistEntry> {
    if (!isDayKey(input.dayKey) || input.dayKey < toStudioDayKey(now)) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes, mai vagy későbbi napot adj meg.' });
    }
    if (input.fromMinutes >= input.toMinutes) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Az idősáv vége a kezdete után legyen.' });
    }
    const treatment = await this.prisma.bookableTreatment.findFirst({
      where: { id: input.treatmentId, studioId: input.studioId, isActive: true },
    });
    if (!treatment) throw appError('BOOKING.TREATMENT_NOT_FOUND');

    const existing = await this.prisma.waitlistEntry.findFirst({
      where: {
        guestId: input.guestId,
        treatmentId: input.treatmentId,
        dayKey: input.dayKey,
        status: { in: ['WAITING', 'OFFERED'] },
      },
    });
    if (existing) return existing;

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.waitlistEntry.create({
        data: {
          studioId: input.studioId,
          guestId: input.guestId,
          treatmentId: input.treatmentId,
          dayKey: input.dayKey,
          fromMinutes: input.fromMinutes,
          toMinutes: input.toMinutes,
        },
      });
      await logBookingAudit(tx, {
        studioId: input.studioId,
        userId: input.actorUserId,
        action: 'WAITLIST_JOINED',
        entityType: 'WaitlistEntry',
        entityId: created.id,
        details: `Várólista: ${treatment.name}, ${input.dayKey}`,
      });
      return created;
    });
    this.events.changed(input.studioId, 'WAITLIST', [input.dayKey]);
    // Ha közben már van szabad hely, azonnal ajánlatot kap.
    await this.offerReleased(input.studioId, treatment.resourceId, input.dayKey, now);
    return entry;
  }

  /**
   * Felszabadult kapacitás egy gépen egy napon: a várakozók a jelentkezés sorrendjében kapnak
   * ajánlatot, amíg van nekik megfelelő szabad időpont. Visszatérés: a kiküldött ajánlatok száma.
   */
  async offerReleased(
    studioId: string,
    resourceId: string,
    dayKey: string,
    now: Date = new Date(),
  ): Promise<number> {
    if (dayKey < toStudioDayKey(now)) return 0;
    const offers = await this.prisma.$transaction(async (tx) => {
      await lockResources(tx, [resourceId]);
      const treatments = await tx.bookableTreatment.findMany({
        where: { studioId, resourceId, isActive: true },
      });
      if (treatments.length === 0) return [];
      const entries = await tx.waitlistEntry.findMany({
        where: {
          studioId,
          dayKey,
          status: 'WAITING',
          treatmentId: { in: treatments.map((t) => t.id) },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (entries.length === 0) return [];

      const { from, to } = dayBounds(dayKey);
      const loaded = await loadContext(tx, studioId, from, to, now);
      const occupancy = [...loaded.ctx.occupancy];
      const made: { entryId: string; token: string }[] = [];

      for (const entry of entries) {
        const treatment = treatments.find((t) => t.id === entry.treatmentId)!;
        const guestBusy = loaded.bookings
          .filter((b) => b.guestId === entry.guestId)
          .map((b) => ({ refId: b.id, startsAt: b.startsAt, endsAt: b.endsAt }));
        const slot = findSequenceSlots({
          dayKey,
          treatments: [treatment],
          resources: loaded.resources,
          ctx: { ...loaded.ctx, occupancy, guestBusy },
          now,
        }).find((s) => {
          const minute = studioMinutesOfDay(s.startsAt);
          return minute >= entry.fromMinutes && minute < entry.toMinutes;
        });
        if (!slot) continue;

        const { token, hash } = createRandomToken();
        const { count } = await tx.waitlistEntry.updateMany({
          where: { id: entry.id, status: 'WAITING' },
          data: {
            status: 'OFFERED',
            offerStartsAt: slot.startsAt,
            offerExpiresAt: new Date(now.getTime() + loaded.settings.holdMinutes * 60_000),
            offerTokenHash: hash,
            offeredAt: now,
          },
        });
        if (count !== 1) continue;
        occupancy.push({
          refId: holdRefId(entry.id),
          resourceId,
          startsAt: slot.startsAt,
          blockedUntil: slot.items[0].blockedUntil,
        });
        await logBookingAudit(tx, {
          studioId,
          userId: null,
          action: 'WAITLIST_OFFERED',
          entityType: 'WaitlistEntry',
          entityId: entry.id,
          details: `Várólistás ajánlat: ${treatment.name}, ${slot.startsAt.toISOString()}`,
        });
        made.push({ entryId: entry.id, token });
      }
      return made;
    });

    for (const offer of offers) {
      await this.notifications.sendWaitlistOffer(offer.entryId, offer.token);
    }
    if (offers.length > 0) this.events.changed(studioId, 'WAITLIST', [dayKey]);
    return offers.length;
  }

  /** Lejárt ajánlatok: EXPIRED, és a következő várakozó kap ajánlatot. Ismételhető. */
  async expireOffers(now: Date = new Date()): Promise<number> {
    const expired = await this.prisma.waitlistEntry.findMany({
      where: { status: 'OFFERED', offerExpiresAt: { lte: now } },
    });
    let count = 0;
    for (const entry of expired) {
      const res = await this.prisma.waitlistEntry.updateMany({
        where: { id: entry.id, status: 'OFFERED' },
        data: { status: 'EXPIRED' },
      });
      if (res.count !== 1) continue;
      count++;
      await this.releaseFor(entry, now);
    }
    return count;
  }

  private async releaseFor(entry: WaitlistEntry, now: Date): Promise<void> {
    const treatment = await this.prisma.bookableTreatment.findUnique({ where: { id: entry.treatmentId } });
    if (!treatment) return;
    try {
      await this.offerReleased(entry.studioId, treatment.resourceId, entry.dayKey, now);
    } catch (err) {
      this.logger.error('Várólistás ajánlat sikertelen', err as Error);
    }
  }

  private async findOffer(token: string): Promise<WaitlistEntry> {
    if (!isWellFormedToken(token)) throw appError('BOOKING.WAITLIST_OFFER_INVALID');
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { offerTokenHash: hashOpaqueToken(token) },
    });
    if (!entry) throw appError('BOOKING.WAITLIST_OFFER_INVALID');
    return entry;
  }

  async getOffer(token: string, now: Date = new Date()): Promise<PublicWaitlistOfferDto> {
    const entry = await this.findOffer(token);
    const [guest, treatment] = await Promise.all([
      this.prisma.guest.findUnique({ where: { id: entry.guestId } }),
      this.prisma.bookableTreatment.findUnique({ where: { id: entry.treatmentId } }),
    ]);
    const live = entry.status === 'OFFERED' && !!entry.offerExpiresAt && entry.offerExpiresAt > now;
    return {
      status: (live || entry.status !== 'OFFERED' ? entry.status : 'EXPIRED') as WaitlistStatus,
      treatmentName: treatment?.name ?? 'Kezelés',
      guestFirstName: guest?.firstName ?? '',
      offerStartsAt: entry.offerStartsAt?.toISOString() ?? null,
      offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
    };
  }

  /** Az ajánlat elfogadása: a tartott időpont foglalássá válik (a saját tartás nem akadály). */
  async accept(token: string, now: Date = new Date()): Promise<PublicCreatedBookingDto> {
    const entry = await this.findOffer(token);
    const secret = guestTokenSecret(this.config);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.waitlistEntry.findUnique({ where: { id: entry.id } });
      if (
        !current ||
        current.status !== 'OFFERED' ||
        !current.offerStartsAt ||
        !current.offerExpiresAt ||
        current.offerExpiresAt <= now ||
        current.offerStartsAt <= now
      ) {
        throw appError('BOOKING.WAITLIST_OFFER_INVALID');
      }
      const [treatment, guest] = await Promise.all([
        tx.bookableTreatment.findUnique({ where: { id: current.treatmentId } }),
        tx.guest.findUnique({ where: { id: current.guestId } }),
      ]);
      if (!treatment || !guest) throw appError('BOOKING.WAITLIST_OFFER_INVALID');

      const created = await createBookingGroup(tx, {
        studioId: current.studioId,
        guestId: guest.id,
        guestGender: guest.gender,
        treatments: [treatment],
        startsAt: current.offerStartsAt,
        actor: { kind: 'GUEST' },
        source: BookingSource.WAITLIST,
        excludeRefIds: [holdRefId(current.id)],
        skipWindow: true,
        tokenSecret: secret,
        now,
      });
      const booking = created.bookings[0];
      const { count } = await tx.waitlistEntry.updateMany({
        where: { id: current.id, status: 'OFFERED' },
        data: { status: 'BOOKED', bookingId: booking.id },
      });
      if (count !== 1) throw appError('BOOKING.WAITLIST_OFFER_INVALID');
      await this.calendarSync.enqueue(tx, current.studioId, [booking.id], 'UPSERT');
      await logBookingAudit(tx, {
        studioId: current.studioId,
        userId: null,
        action: 'BOOKING_CREATED',
        entityId: booking.id,
        details: `Várólistás ajánlat elfogadva: ${treatment.name}`,
      });
      const settings = await loadBookingSettings(tx, current.studioId);
      return { booking, treatmentName: treatment.name, cutoffHours: settings.changeCutoffHours };
    });

    await this.notifications.sendConfirmation([result.booking.id]);
    this.events.changed(result.booking.studioId, 'CREATED', [result.booking.startsAt]);
    const deadline = changeDeadline(result.booking.startsAt, { changeCutoffHours: result.cutoffHours });
    return {
      id: result.booking.id,
      groupId: result.booking.groupId,
      treatmentName: result.treatmentName,
      startsAt: result.booking.startsAt.toISOString(),
      endsAt: result.booking.endsAt.toISOString(),
      status: result.booking.status as unknown as PublicCreatedBookingDto['status'],
      canChange: deadline > now,
      changeDeadline: deadline.toISOString(),
      manageToken: manageTokenFor(secret, result.booking.id),
    };
  }

  async decline(token: string, now: Date = new Date()): Promise<{ ok: true }> {
    const entry = await this.findOffer(token);
    const { count } = await this.prisma.waitlistEntry.updateMany({
      where: { id: entry.id, status: 'OFFERED' },
      data: { status: 'DECLINED' },
    });
    if (count !== 1) throw appError('BOOKING.WAITLIST_OFFER_INVALID');
    await this.releaseFor(entry, now);
    return { ok: true };
  }

  async listForStaff(studioId: string, fromDayKey: string): Promise<WaitlistEntryDto[]> {
    const entries = await this.prisma.waitlistEntry.findMany({
      where: {
        studioId,
        dayKey: { gte: fromDayKey },
        status: { in: ['WAITING', 'OFFERED'] },
      },
      orderBy: [{ dayKey: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    if (entries.length === 0) return [];
    const [guests, treatments] = await Promise.all([
      this.prisma.guest.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.guestId))] } } }),
      this.prisma.bookableTreatment.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.treatmentId))] } } }),
    ]);
    const guestById = new Map(guests.map((g) => [g.id, g]));
    const treatmentById = new Map(treatments.map((t) => [t.id, t]));
    return entries.map((e) => {
      const guest = guestById.get(e.guestId);
      return {
        id: e.id,
        guestId: e.guestId,
        guestName: guest ? `${guest.lastName} ${guest.firstName}` : 'Ismeretlen vendég',
        treatmentId: e.treatmentId,
        treatmentName: treatmentById.get(e.treatmentId)?.name ?? 'Kezelés',
        dayKey: e.dayKey,
        fromMinutes: e.fromMinutes,
        toMinutes: e.toMinutes,
        status: e.status as unknown as WaitlistStatus,
        offerStartsAt: e.offerStartsAt?.toISOString() ?? null,
        offerExpiresAt: e.offerExpiresAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      };
    });
  }

  /** Recepciós törlés a várólistáról; élő ajánlatnál a hely a következőé. */
  async cancel(studioId: string, entryId: string, userId: string, now: Date = new Date()): Promise<{ ok: true }> {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { id: entryId, studioId } });
    if (!entry) throw appError('BOOKING.WAITLIST_NOT_FOUND');
    const { count } = await this.prisma.waitlistEntry.updateMany({
      where: { id: entry.id, status: { in: ['WAITING', 'OFFERED'] } },
      data: { status: 'CANCELLED' },
    });
    if (count !== 1) throw appError('BOOKING.WAITLIST_NOT_FOUND');
    await this.prisma.auditLog.create({
      data: {
        studioId,
        userId,
        action: 'WAITLIST_CANCELLED',
        entityType: 'WaitlistEntry',
        entityId: entry.id,
        details: `Várólistáról törölve (${entry.dayKey})`,
      },
    });
    this.events.changed(studioId, 'WAITLIST', [entry.dayKey]);
    if (entry.status === 'OFFERED') await this.releaseFor(entry, now);
    return { ok: true };
  }
}
