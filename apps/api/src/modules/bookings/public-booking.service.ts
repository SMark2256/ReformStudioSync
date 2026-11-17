import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Booking, Guest } from '@prisma/client';
import {
  appError,
  BookingAvailabilityDto,
  BookingSettingsDto,
  BookingSource,
  BookingStatus,
  changeDeadline,
  checkChangeWindow,
  DEFAULT_STUDIO_ID,
  getPassStatus,
  GuestBookingProfileDto,
  GuestLoginResponseDto,
  GuestPassSummaryDto,
  parseTimeOfDay,
  PublicBookingCatalogDto,
  PublicBookingSummaryDto,
  PublicCreateBookingResponseDto,
  PublicCreatedBookingDto,
  PublicManageBookingDto,
  toStudioDayKey,
} from '@reform/shared';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { guestTokenSecret } from './booking-config';
import {
  cancelBooking,
  createBookingGroup,
  loadBookingSettings,
  lockBooking,
  logBookingAudit,
  rescheduleBooking,
  Tx,
} from './booking-engine';
import { BookingEvents } from './booking-events';
import { BookingNotificationsService } from './booking-notifications.service';
import { loadGuestPasses } from './booking-passes';
import {
  hashOpaqueToken,
  isWellFormedToken,
  manageTokenFor,
  signGuestSession,
  verifyGuestSession,
} from './booking-tokens';
import type {
  GuestCodeRequestBody,
  GuestCodeVerifyBody,
  PublicContactBody,
  PublicCreateBookingBody,
  PublicWaitlistBody,
} from './bookings.dto';
import { BookingsService } from './bookings.service';
import { CalendarSyncService } from './calendar-sync.service';
import { WaitlistService } from './waitlist.service';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
export const GUEST_CODE_TTL_MINUTES = 10;
/** Ugyanarra a címre legfeljebb percenként egy, óránként öt kód. */
const RESEND_INTERVAL_MS = MINUTE_MS;
const MAX_CODES_PER_HOUR = 5;
/** Kódonként ennyi próbálkozás; az utolsó hibás után a kód elvész. */
export const MAX_GUEST_CODE_ATTEMPTS = 5;
/** A vendég munkamenete a kódos belépés után. */
const GUEST_SESSION_TTL_MS = 2 * HOUR_MS;
/** A profilban ennyi napra visszamenőleg látszanak a foglalások. */
const PROFILE_HISTORY_DAYS = 30;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Nyilvános foglaló (TICKET-57, `/foglalas`): munkatársi belépés nélkül. A vendég névvel,
 * telefonnal és e-maillel foglal, vagy e-mailes 6 jegyű kóddal belép (`GuestLoginCode`, a
 * TICKET-35 mintájára, hash-elve, lejárattal, próbálkozás- és kéréskorláttal). Személyes adat
 * (bérlet, foglalások) csak azonosítás után jár; a kezelőlink csak az adott foglalást mutatja.
 */
@Injectable()
export class PublicBookingService {
  private readonly logger = new Logger(PublicBookingService.name);
  private readonly studioId = DEFAULT_STUDIO_ID;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly notifications: BookingNotificationsService,
    private readonly calendarSync: CalendarSyncService,
    private readonly waitlist: WaitlistService,
    private readonly events: BookingEvents,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return guestTokenSecret(this.config);
  }

  /** Teszteknek (E2E, CI): rögzített kód, levél és kéréskorlát nélkül. Productionben nincs. */
  private get fixedCode(): string | undefined {
    if (this.config.get<string>('NODE_ENV') === 'production') return undefined;
    return this.config.get<string>('AUTH_FIXED_LOGIN_CODE') || undefined;
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.secret).update(`guest-code:${email}:${code}`).digest('hex');
  }

  private background(label: string, task: Promise<unknown>): void {
    task.catch((err) => this.logger.error(`${label} sikertelen`, err as Error));
  }

  // -------------------------------------------------------------------------
  // Katalógus és szabad időpontok
  // -------------------------------------------------------------------------

  async catalog(now: Date = new Date()): Promise<PublicBookingCatalogDto> {
    const settings = await loadBookingSettings(this.prisma, this.studioId);
    const treatments = await this.prisma.bookableTreatment.findMany({
      where: { studioId: this.studioId, isActive: true, isOnline: true },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      treatments: treatments.map((t) => ({
        id: t.id,
        name: t.name,
        durationMinutes: t.durationMinutes,
        sortOrder: t.sortOrder,
      })),
      maxAdvanceDays: settings.maxAdvanceDays,
      minLeadMinutes: settings.minLeadMinutes,
      changeCutoffHours: settings.changeCutoffHours,
      locationText: settings.locationText,
      today: toStudioDayKey(now),
    };
  }

  /** Szabad időpontok; bejelentkezve a vendég saját kezeléseivel ütköző időpontok kimaradnak. */
  availability(
    dayKey: string,
    treatmentIds: string[],
    session?: string,
    now: Date = new Date(),
  ): Promise<BookingAvailabilityDto> {
    return this.bookings.availability(
      {
        studioId: this.studioId,
        dayKey,
        treatmentIds,
        guestId: this.sessionGuestId(session, now),
        onlineOnly: true,
      },
      now,
    );
  }

  // -------------------------------------------------------------------------
  // Vendégazonosítás (e-mailes kód, munkamenet)
  // -------------------------------------------------------------------------

  private sessionGuestId(session: string | undefined, now: Date): string | null {
    return session ? verifyGuestSession(this.secret, session, now) : null;
  }

  private async requireSessionGuest(session: string | undefined, now: Date): Promise<Guest> {
    const guestId = this.sessionGuestId(session, now);
    const guest = guestId
      ? await this.prisma.guest.findFirst({ where: { id: guestId, studioId: this.studioId, isActive: true } })
      : null;
    if (!guest) throw appError('BOOKING.GUEST_SESSION_INVALID');
    return guest;
  }

  /** Az e-mail címhez tartozó vendég (több egyezésnél a legrégebbi profil). */
  private findGuestByEmail(db: Tx, email: string) {
    return db.guest.findFirst({
      where: { studioId: this.studioId, isActive: true, email: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Belépőkód kérése. Ismeretlen címre is ugyanaz a válasz (levél nélkül, felhasználhatatlan
   * sorral), így sem a válasz, sem a kéréskorlát nem árulja el, kinek van profilja.
   */
  async requestCode(dto: GuestCodeRequestBody, now: Date = new Date()): Promise<{ ok: true }> {
    const email = normalizeEmail(dto.email);
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const fixedCode = this.fixedCode;

    await this.prisma.guestLoginCode.deleteMany({ where: { createdAt: { lt: hourAgo } } });
    if (!fixedCode) {
      const recent = await this.prisma.guestLoginCode.findMany({
        where: { email, createdAt: { gte: hourAgo } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const latest = recent[0]?.createdAt.getTime();
      if (
        recent.length >= MAX_CODES_PER_HOUR ||
        (latest !== undefined && now.getTime() - latest < RESEND_INTERVAL_MS)
      ) {
        throw appError('BOOKING.GUEST_CODE_RATE_LIMITED');
      }
    }

    const guest = await this.findGuestByEmail(this.prisma, email);
    const code = fixedCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = guest ? this.hashCode(email, code) : `unusable:${randomBytes(16).toString('hex')}`;
    const [, created] = await this.prisma.$transaction([
      this.prisma.guestLoginCode.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: now } }),
      this.prisma.guestLoginCode.create({
        data: { email, codeHash, expiresAt: new Date(now.getTime() + GUEST_CODE_TTL_MINUTES * MINUTE_MS) },
      }),
    ]);
    if (!guest || fixedCode) return { ok: true };

    const result = await this.notifications.sendGuestCode(guest, code, GUEST_CODE_TTL_MINUTES);
    if (result === 'SKIPPED' && this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(`Levélküldés nincs beállítva. Vendég belépőkód (${email}): ${code}`);
    }
    if (result === 'FAILED') {
      // Ki nem ment kód ne fogyassza a kéréskorlátot.
      await this.prisma.guestLoginCode.delete({ where: { id: created.id } });
      throw appError('COMMON.INTERNAL', { message: 'A belépőkódot most nem sikerült elküldeni. Próbáld újra.' });
    }
    return { ok: true };
  }

  async verifyCode(dto: GuestCodeVerifyBody, now: Date = new Date()): Promise<GuestLoginResponseDto> {
    const email = normalizeEmail(dto.email);
    const row = await this.prisma.guestLoginCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.attempts >= MAX_GUEST_CODE_ATTEMPTS) throw appError('BOOKING.GUEST_CODE_INVALID');

    if (!safeEqual(row.codeHash, this.hashCode(email, dto.code))) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= MAX_GUEST_CODE_ATTEMPTS;
      await this.prisma.guestLoginCode.updateMany({
        where: { id: row.id, attempts: row.attempts, consumedAt: null },
        data: { attempts, ...(exhausted ? { consumedAt: now } : {}) },
      });
      throw appError(
        'BOOKING.GUEST_CODE_INVALID',
        exhausted ? { message: 'Túl sok hibás próbálkozás, ez a kód már nem használható. Kérj új kódot.' } : undefined,
      );
    }

    // Egyszer használható: csak az nyer, aki elsőként jelöli felhasználtnak.
    const { count } = await this.prisma.guestLoginCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: now },
    });
    const guest = await this.findGuestByEmail(this.prisma, email);
    if (count === 0 || !guest) throw appError('BOOKING.GUEST_CODE_INVALID');

    const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);
    return {
      guestToken: signGuestSession(this.secret, guest.id, expiresAt),
      expiresAt: expiresAt.toISOString(),
      profile: await this.buildProfile(guest, now),
    };
  }

  async profile(session: string | undefined, now: Date = new Date()): Promise<GuestBookingProfileDto> {
    return this.buildProfile(await this.requireSessionGuest(session, now), now);
  }

  private async buildProfile(guest: Guest, now: Date): Promise<GuestBookingProfileDto> {
    const settings = await loadBookingSettings(this.prisma, this.studioId);
    const [passes, rows] = await Promise.all([
      loadGuestPasses(this.prisma, guest.id),
      this.prisma.booking.findMany({
        where: { guestId: guest.id, startsAt: { gte: new Date(now.getTime() - PROFILE_HISTORY_DAYS * 24 * HOUR_MS) } },
        orderBy: { startsAt: 'asc' },
        take: 50,
      }),
    ]);
    const passDtos: GuestPassSummaryDto[] = passes
      .filter((p) => !p.cancelledAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        serviceName: p.serviceName,
        type: p.type as unknown as GuestPassSummaryDto['type'],
        remainingPasses: p.remainingPasses,
        totalPasses: p.row.totalPasses,
        expirationDate: p.row.expirationDate.toISOString(),
        status: getPassStatus(p, now),
      }));
    return {
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email ?? '',
      passes: passDtos,
      bookings: await this.summaries(rows, settings, now),
    };
  }

  // -------------------------------------------------------------------------
  // Foglalás
  // -------------------------------------------------------------------------

  private async summaries(
    rows: readonly Booking[],
    settings: BookingSettingsDto,
    now: Date,
  ): Promise<PublicBookingSummaryDto[]> {
    if (rows.length === 0) return [];
    const treatments = await this.prisma.bookableTreatment.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.treatmentId))] } },
    });
    const nameOf = new Map(treatments.map((t) => [t.id, t.name]));
    return rows.map((b) => ({
      id: b.id,
      groupId: b.groupId,
      treatmentName: nameOf.get(b.treatmentId) ?? 'Kezelés',
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      status: b.status as unknown as BookingStatus,
      canChange:
        (b.status === 'CONFIRMED' || b.status === 'LATE') &&
        checkChangeWindow(b.startsAt, now, settings) === null,
      changeDeadline: changeDeadline(b.startsAt, settings).toISOString(),
    }));
  }

  /**
   * Bejelentkezés nélkül az e-mail cím alapján a meglévő vendégprofilhoz kapcsolja a foglalást
   * (duplikáció nélkül), vagy új profilt hoz létre. A meglévő profil adatait nem írja felül,
   * csak a hiányzó telefonszámot pótolja.
   */
  private async findOrCreateGuest(tx: Tx, contact: PublicContactBody): Promise<Guest> {
    const email = normalizeEmail(contact.email);
    const existing = await this.findGuestByEmail(tx, email);
    if (existing) {
      if (!existing.phone && contact.phone) {
        return tx.guest.update({ where: { id: existing.id }, data: { phone: contact.phone.trim() } });
      }
      return existing;
    }
    return tx.guest.create({
      data: {
        studioId: this.studioId,
        barcode: await this.uniqueBarcode(tx),
        lastName: contact.lastName.trim(),
        firstName: contact.firstName.trim(),
        email,
        phone: contact.phone.trim(),
        notes: 'Online foglaláskor létrehozott profil.',
      },
    });
  }

  private async uniqueBarcode(tx: Tx): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = `RS${randomInt(100000, 999999)}`;
      const exists = await tx.guest.findUnique({
        where: { studioId_barcode: { studioId: this.studioId, barcode: candidate } },
      });
      if (!exists) return candidate;
    }
    return `RS${Date.now().toString().slice(-6)}`;
  }

  async create(
    body: PublicCreateBookingBody,
    session: string | undefined,
    now: Date = new Date(),
  ): Promise<PublicCreateBookingResponseDto> {
    if (!body.privacyAccepted) throw appError('BOOKING.PRIVACY_REQUIRED');
    const sessionGuest = session ? await this.requireSessionGuest(session, now) : null;
    if (!sessionGuest && !body.contact) throw appError('BOOKING.CONTACT_REQUIRED');
    const startsAt = new Date(body.startsAt);

    const created = await this.prisma.$transaction(async (tx) => {
      const guest = sessionGuest ?? (await this.findOrCreateGuest(tx, body.contact!));
      const all = await tx.bookableTreatment.findMany({ where: { studioId: this.studioId } });
      const treatments = this.bookings.pickTreatments(all, body.treatmentIds, true);
      const group = await createBookingGroup(tx, {
        studioId: this.studioId,
        guestId: guest.id,
        guestGender: guest.gender,
        treatments,
        startsAt,
        actor: { kind: 'GUEST' },
        source: BookingSource.ONLINE,
        note: body.note,
        tokenSecret: this.secret,
        now,
      });
      await this.calendarSync.enqueue(tx, this.studioId, group.bookings.map((b) => b.id), 'UPSERT');
      await logBookingAudit(tx, {
        studioId: this.studioId,
        userId: null,
        action: 'BOOKING_CREATED_ONLINE',
        entityType: 'BookingGroup',
        entityId: group.groupId,
        details: `Online foglalás${sessionGuest ? ' (bejelentkezve)' : ''}: ${guest.lastName} ${guest.firstName}: ${treatments.map((t) => t.name).join(', ')}, ${startsAt.toISOString()}`,
      });
      return { group, treatments };
    });

    this.background('Visszaigazolás', this.notifications.sendConfirmation(created.group.bookings.map((b) => b.id)));
    this.events.changed(this.studioId, 'CREATED', [startsAt]);

    const settings = await loadBookingSettings(this.prisma, this.studioId);
    const summaries = await this.summaries(created.group.bookings, settings, now);
    return {
      groupId: created.group.groupId,
      bookings: summaries.map(
        (s): PublicCreatedBookingDto => ({ ...s, manageToken: manageTokenFor(this.secret, s.id) }),
      ),
      // A bérletadat személyes adat: csak a bejelentkezett vendég látja.
      passWarnings: sessionGuest
        ? created.treatments.flatMap((t) => {
            const warning = created.group.warnings.get(t.id);
            return warning ? [{ treatmentId: t.id, treatmentName: t.name, warning }] : [];
          })
        : [],
    };
  }

  // -------------------------------------------------------------------------
  // Kezelőlink (`/foglalas/kezeles/:token`)
  // -------------------------------------------------------------------------

  private async findByManageToken(db: Tx, token: string): Promise<Booking> {
    if (!isWellFormedToken(token)) throw appError('BOOKING.LINK_INVALID');
    const booking = await db.booking.findUnique({ where: { manageTokenHash: hashOpaqueToken(token) } });
    if (!booking || booking.studioId !== this.studioId) throw appError('BOOKING.LINK_INVALID');
    return booking;
  }

  async getManaged(token: string, now: Date = new Date()): Promise<PublicManageBookingDto> {
    const booking = await this.findByManageToken(this.prisma, token);
    return this.toManageDto(booking, now);
  }

  private async toManageDto(booking: Booking, now: Date): Promise<PublicManageBookingDto> {
    const settings = await loadBookingSettings(this.prisma, this.studioId);
    const guest = await this.prisma.guest.findUnique({ where: { id: booking.guestId } });
    const [summary] = await this.summaries([booking], settings, now);
    return {
      ...summary,
      treatmentId: booking.treatmentId,
      // Csak a keresztnév: a link továbbküldhető, ezért más személyes adat nincs rajta.
      guestFirstName: guest?.firstName ?? '',
      locationText: settings.locationText,
    };
  }

  /** Szabad időpontok az áthelyezéshez (a saját foglalás nem foglaltság). */
  async managedAvailability(token: string, dayKey: string, now: Date = new Date()): Promise<BookingAvailabilityDto> {
    const booking = await this.findByManageToken(this.prisma, token);
    return this.bookings.availability(
      {
        studioId: this.studioId,
        dayKey,
        treatmentIds: [booking.treatmentId],
        guestId: booking.guestId,
        excludeBookingIds: [booking.id],
      },
      now,
    );
  }

  async rescheduleManaged(token: string, startsAtIso: string, now: Date = new Date()): Promise<PublicManageBookingDto> {
    const startsAt = new Date(startsAtIso);
    const result = await this.prisma.$transaction(async (tx) => {
      const found = await this.findByManageToken(tx, token);
      await lockBooking(tx, found.id);
      const booking = (await tx.booking.findUnique({ where: { id: found.id } })) ?? found;
      const moved = await rescheduleBooking(tx, { booking, startsAt, actor: { kind: 'GUEST' }, now });
      await this.calendarSync.enqueue(tx, this.studioId, [booking.id], 'UPSERT');
      await logBookingAudit(tx, {
        studioId: this.studioId,
        userId: null,
        action: 'BOOKING_RESCHEDULED_ONLINE',
        entityId: booking.id,
        details: `Online áthelyezés: ${booking.startsAt.toISOString()} → ${moved.after.startsAt.toISOString()}`,
      });
      return moved;
    });

    this.background('Módosítási levél', this.notifications.sendRescheduled(result.after.id));
    this.background(
      'Várólistás ajánlat',
      this.waitlist.offerReleased(this.studioId, result.before.resourceId, toStudioDayKey(result.before.startsAt)),
    );
    this.events.changed(this.studioId, 'RESCHEDULED', [result.before.startsAt, result.after.startsAt]);
    return this.toManageDto(result.after, now);
  }

  async cancelManaged(token: string, now: Date = new Date()): Promise<PublicManageBookingDto> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const found = await this.findByManageToken(tx, token);
      await lockBooking(tx, found.id);
      const booking = (await tx.booking.findUnique({ where: { id: found.id } })) ?? found;
      const updated = await cancelBooking(tx, { booking, actor: { kind: 'GUEST' }, now });
      await this.calendarSync.enqueue(tx, this.studioId, [booking.id], 'DELETE');
      await logBookingAudit(tx, {
        studioId: this.studioId,
        userId: null,
        action: 'BOOKING_CANCELLED_ONLINE',
        entityId: booking.id,
        details: 'Online lemondás a kezelőlinkkel',
      });
      return updated;
    });

    this.background('Lemondási levél', this.notifications.sendCancelled(cancelled.id));
    this.background(
      'Várólistás ajánlat',
      this.waitlist.offerReleased(this.studioId, cancelled.resourceId, toStudioDayKey(cancelled.startsAt)),
    );
    this.events.changed(this.studioId, 'CANCELLED', [cancelled.startsAt]);
    return this.toManageDto(cancelled, now);
  }

  // -------------------------------------------------------------------------
  // Várólista
  // -------------------------------------------------------------------------

  async joinWaitlist(body: PublicWaitlistBody, session: string | undefined, now: Date = new Date()): Promise<{ ok: true }> {
    if (!body.privacyAccepted) throw appError('BOOKING.PRIVACY_REQUIRED');
    const fromMinutes = parseTimeOfDay(body.fromTime);
    const toMinutes = parseTimeOfDay(body.toTime);
    if (fromMinutes === null || toMinutes === null) {
      throw appError('COMMON.VALIDATION_FAILED', { message: 'Érvényes idősávot adj meg (ÓÓ:PP).' });
    }
    const treatment = await this.prisma.bookableTreatment.findFirst({
      where: { id: body.treatmentId, studioId: this.studioId, isActive: true, isOnline: true },
    });
    if (!treatment) throw appError('BOOKING.TREATMENT_NOT_FOUND');

    let guest: Guest;
    if (session) {
      guest = await this.requireSessionGuest(session, now);
    } else {
      if (!body.contact) throw appError('BOOKING.CONTACT_REQUIRED');
      guest = await this.prisma.$transaction((tx) => this.findOrCreateGuest(tx, body.contact!));
    }
    await this.waitlist.join(
      {
        studioId: this.studioId,
        guestId: guest.id,
        treatmentId: treatment.id,
        dayKey: body.dayKey,
        fromMinutes,
        toMinutes,
        actorUserId: null,
      },
      now,
    );
    return { ok: true };
  }
}
