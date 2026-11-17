import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Booking, Guest } from '@prisma/client';
import {
  BOOKING_PASS_WARNING_TEXT,
  BOOKING_REMINDER_LEAD_MS,
  BookingPassWarning,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { RenderedEmail } from '../mail/templates/login-code';
import { guestTokenSecret, publicWebUrl } from './booking-config';
import { formatBookingMoment, formatBookingWhen, renderBookingEmail } from './booking-emails';
import { loadBookingSettings } from './booking-engine';
import { manageTokenFor } from './booking-tokens';

export type BookingMessageType =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_REMINDER'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_WAITLIST_OFFER'
  | 'BOOKING_GUEST_CODE';

type DeliveryResult = 'SENT' | 'FAILED' | 'SKIPPED';

/** Ennyiszer próbálkozunk egy emlékeztetővel (átmeneti levélküldési hiba). */
const MAX_REMINDER_ATTEMPTS = 3;
const REMINDER_BATCH = 20;

/**
 * Foglalási levelek (TICKET-57): visszaigazolás, 24 órás emlékeztető, módosítás, lemondás,
 * várólistás ajánlat és a vendég belépőkódja. A meglévő `MailService.send`-et hívja, minden
 * kísérlet a `MessageLog`-ba kerül. A levél a foglalás után, a tranzakción kívül megy ki, és a
 * hibája a foglalást nem érinti. (A TICKET-55 levélsorára később átállítható.)
 */
@Injectable()
export class BookingNotificationsService {
  private readonly logger = new Logger(BookingNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  manageUrl(bookingId: string): string {
    return `${publicWebUrl(this.config)}/foglalas/kezeles/${manageTokenFor(guestTokenSecret(this.config), bookingId)}`;
  }

  waitlistUrl(token: string): string {
    return `${publicWebUrl(this.config)}/foglalas/varolista/${token}`;
  }

  private async context(bookings: Booking[]) {
    const studioId = bookings[0]?.studioId ?? 'default-studio';
    const [settings, treatments] = await Promise.all([
      loadBookingSettings(this.prisma, studioId),
      this.prisma.bookableTreatment.findMany({
        where: { id: { in: [...new Set(bookings.map((b) => b.treatmentId))] } },
      }),
    ]);
    const nameOf = new Map(treatments.map((t) => [t.id, t.name]));
    const lines = bookings.map((b) => ({
      treatmentName: nameOf.get(b.treatmentId) ?? 'Kezelés',
      when: formatBookingWhen(b.startsAt, b.endsAt),
    }));
    const location = settings.locationText.trim() || 'Re-Form Stúdió';
    const changeRule = `Online módosítás és lemondás a kezdés előtt legalább ${settings.changeCutoffHours} órával lehetséges; ezután a recepció tud segíteni.`;
    return { settings, lines, location, changeRule };
  }

  private async deliver(
    guest: Guest,
    messageType: BookingMessageType,
    message: RenderedEmail,
  ): Promise<DeliveryResult> {
    if (!guest.email) return 'SKIPPED';
    const log = (status: 'SENT' | 'FAILED', errorDetails?: string) =>
      this.prisma.messageLog
        .create({
          data: {
            guestId: guest.id,
            recipientEmail: guest.email!,
            subject: message.subject,
            messageType,
            status,
            errorDetails: errorDetails ?? null,
          },
        })
        .catch((err) => this.logger.warn(`MessageLog írás sikertelen: ${(err as Error).message}`));

    if (!this.mail.isConfigured) {
      this.logger.warn(`Levélküldés nincs beállítva, kimaradt: ${messageType}`);
      await log('FAILED', 'Levélküldés nincs beállítva (SENDPULSE_API_KEY).');
      return 'SKIPPED';
    }
    try {
      await this.mail.send({ email: guest.email, name: `${guest.lastName} ${guest.firstName}` }, message);
      await log('SENT');
      return 'SENT';
    } catch (err) {
      await log('FAILED', (err as Error).message);
      return 'FAILED';
    }
  }

  /** Visszaigazolás egy foglalási csoportról (egy levél, kezelésenként egy sor és link). */
  async sendConfirmation(bookingIds: readonly string[]): Promise<void> {
    try {
      const bookings = await this.prisma.booking.findMany({
        where: { id: { in: [...bookingIds] } },
        orderBy: { startsAt: 'asc' },
      });
      if (bookings.length === 0) return;
      const guest = await this.prisma.guest.findUnique({ where: { id: bookings[0].guestId } });
      if (!guest) return;
      const { lines, location, changeRule } = await this.context(bookings);
      const warnings = [
        ...new Set(bookings.map((b) => b.passWarning).filter((w): w is string => !!w)),
      ].map((w) => BOOKING_PASS_WARNING_TEXT[w as BookingPassWarning] ?? w);

      const result = await this.deliver(
        guest,
        'BOOKING_CONFIRMATION',
        renderBookingEmail({
          subject: 'Foglalás visszaigazolva – Re-Form Stúdió',
          title: 'Foglalásodat visszaigazoltuk',
          greetingName: guest.firstName,
          intro:
            bookings.length > 1
              ? 'Az alábbi kezelésekre foglaltál időpontot:'
              : 'Az alábbi kezelésre foglaltál időpontot:',
          lines,
          facts: [
            ['Helyszín', location],
            ['Módosítás és lemondás', changeRule],
          ],
          paragraphs: [
            ...warnings,
            ...(bookings.length > 1
              ? ['A kezeléseket külön-külön is módosíthatod vagy lemondhatod; a többi foglalás megmarad.']
              : []),
          ],
          action: { label: 'Foglalás kezelése', url: this.manageUrl(bookings[0].id) },
        }),
      );
      if (result === 'SENT') {
        await this.prisma.booking.updateMany({
          where: { id: { in: bookings.map((b) => b.id) } },
          data: { confirmationSentAt: new Date() },
        });
      }
    } catch (err) {
      this.logger.error('Visszaigazoló levél sikertelen', err as Error);
    }
  }

  async sendRescheduled(bookingId: string): Promise<void> {
    await this.sendSingle(bookingId, 'BOOKING_RESCHEDULED', (ctx) => ({
      subject: 'Foglalás módosítva – Re-Form Stúdió',
      title: 'Foglalásod új időpontja',
      intro: 'A foglalásod időpontja módosult. Az új időpont:',
      facts: [
        ['Helyszín', ctx.location],
        ['Módosítás és lemondás', ctx.changeRule],
      ],
      withAction: true,
    }));
  }

  async sendCancelled(bookingId: string): Promise<void> {
    await this.sendSingle(bookingId, 'BOOKING_CANCELLED', () => ({
      subject: 'Foglalás lemondva – Re-Form Stúdió',
      title: 'Foglalásodat lemondtuk',
      intro: 'Az alábbi foglalásod le lett mondva:',
      facts: [],
      paragraphs: ['Ha új időpontot szeretnél, a foglalási oldalon vagy a recepción foglalhatsz.'],
      withAction: false,
    }));
  }

  /** 24 órás emlékeztető: nem ígér online lemondást, mert a határidő ekkor jár le. */
  async sendReminder(booking: Booking): Promise<DeliveryResult> {
    return this.sendSingle(booking.id, 'BOOKING_REMINDER', (ctx) => ({
      subject: 'Emlékeztető: holnapi kezelésed – Re-Form Stúdió',
      title: 'Emlékeztető a kezelésedről',
      intro: 'Emlékeztetünk a közelgő foglalásodra:',
      facts: [
        ['Helyszín', ctx.location],
        [
          'Lemondási szabály',
          `Online módosítás és lemondás a kezdés előtt legalább ${ctx.settings.changeCutoffHours} órával lehetséges. Ez a határidő mostanra lejárhatott; ha nem tudsz jönni, kérjük, minél hamarabb jelezd a recepción.`,
        ],
      ],
      withAction: false,
    }));
  }

  private async sendSingle(
    bookingId: string,
    messageType: BookingMessageType,
    build: (ctx: Awaited<ReturnType<BookingNotificationsService['context']>>) => {
      subject: string;
      title: string;
      intro: string;
      facts: [string, string][];
      paragraphs?: string[];
      withAction: boolean;
    },
  ): Promise<DeliveryResult> {
    try {
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return 'SKIPPED';
      const guest = await this.prisma.guest.findUnique({ where: { id: booking.guestId } });
      if (!guest) return 'SKIPPED';
      const ctx = await this.context([booking]);
      const content = build(ctx);
      return await this.deliver(
        guest,
        messageType,
        renderBookingEmail({
          subject: content.subject,
          title: content.title,
          greetingName: guest.firstName,
          intro: content.intro,
          lines: ctx.lines,
          facts: content.facts,
          paragraphs: content.paragraphs,
          action: content.withAction ? { label: 'Foglalás kezelése', url: this.manageUrl(booking.id) } : undefined,
        }),
      );
    } catch (err) {
      this.logger.error(`${messageType} levél sikertelen`, err as Error);
      return 'FAILED';
    }
  }

  /**
   * Az esedékes emlékeztetők (a kezdés előtt 24 órán belül, még nem küldött). Az állapot az
   * adatbázisban él (`reminderSentAt`), így újraindítás után sem megy ki kétszer: előbb
   * feltételesen lefoglaljuk, utána küldünk; átmeneti hibánál legfeljebb háromszor próbáljuk.
   * A kezdés előtt 24 órán belül készült foglalásnak a visszaigazolás az emlékeztető.
   */
  async sendDueReminders(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'LATE'] },
        reminderSentAt: null,
        reminderAttempts: { lt: MAX_REMINDER_ATTEMPTS },
        startsAt: { gt: now, lte: new Date(now.getTime() + BOOKING_REMINDER_LEAD_MS) },
      },
      orderBy: { startsAt: 'asc' },
      take: REMINDER_BATCH,
    });

    let sent = 0;
    for (const booking of due) {
      const { count } = await this.prisma.booking.updateMany({
        where: { id: booking.id, reminderSentAt: null },
        data: { reminderSentAt: now, reminderAttempts: { increment: 1 } },
      });
      if (count !== 1) continue;
      const lateBooking =
        booking.createdAt.getTime() > booking.startsAt.getTime() - BOOKING_REMINDER_LEAD_MS;
      if (lateBooking) continue;

      const result = await this.sendReminder(booking);
      if (result === 'SENT') sent++;
      if (result === 'FAILED') {
        await this.prisma.booking.updateMany({
          where: { id: booking.id, reminderSentAt: now },
          data: { reminderSentAt: null },
        });
      }
    }
    return sent;
  }

  async sendWaitlistOffer(entryId: string, token: string): Promise<void> {
    try {
      const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId } });
      if (!entry?.offerStartsAt || !entry.offerExpiresAt) return;
      const [guest, treatment] = await Promise.all([
        this.prisma.guest.findUnique({ where: { id: entry.guestId } }),
        this.prisma.bookableTreatment.findUnique({ where: { id: entry.treatmentId } }),
      ]);
      if (!guest || !treatment) return;
      const endsAt = new Date(entry.offerStartsAt.getTime() + treatment.durationMinutes * 60_000);
      await this.deliver(
        guest,
        'BOOKING_WAITLIST_OFFER',
        renderBookingEmail({
          subject: 'Felszabadult egy időpont – Re-Form Stúdió',
          title: 'Felszabadult egy időpont',
          greetingName: guest.firstName,
          intro: 'A várólistán jelzett kezelésedre felszabadult egy időpont, amelyet neked tartunk fenn:',
          lines: [{ treatmentName: treatment.name, when: formatBookingWhen(entry.offerStartsAt, endsAt) }],
          facts: [['Fenntartva eddig', formatBookingMoment(entry.offerExpiresAt)]],
          paragraphs: ['Ha addig nem foglalod le, a következő várakozó kapja meg.'],
          action: { label: 'Időpont lefoglalása', url: this.waitlistUrl(token) },
        }),
      );
    } catch (err) {
      this.logger.error('Várólistás levél sikertelen', err as Error);
    }
  }

  /** A vendég belépőkódja; a hibát a hívó kezeli (a kódot ilyenkor törli). */
  async sendGuestCode(guest: Guest, code: string, ttlMinutes: number): Promise<DeliveryResult> {
    return this.deliver(
      guest,
      'BOOKING_GUEST_CODE',
      renderBookingEmail({
        // A tárgy a `MessageLog`-ba kerül, ezért a kód nincs benne.
        subject: 'Belépőkód a Re-Form Stúdió foglalásaidhoz',
        title: 'Belépőkód',
        greetingName: guest.firstName,
        intro: `A foglalásaid megtekintéséhez ezt a kódot add meg: ${code}`,
        paragraphs: [
          `A kód ${ttlMinutes} percig érvényes, és csak egyszer használható.`,
          'Ha nem te kérted, hagyd figyelmen kívül ezt a levelet.',
        ],
      }),
    );
  }
}
