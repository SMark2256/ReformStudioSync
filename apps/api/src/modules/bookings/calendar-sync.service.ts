import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BOOKING_STATUS_LABELS, BookingStatusValue, CalendarSyncStatusDto } from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { calendarEventIdFor, GoogleCalendarClient } from './google-calendar.client';

type Tx = Prisma.TransactionClient;

/** Ennyi sikertelen próbálkozás után a tétel FAILED lesz (a recepción újrapróbálható). */
export const MAX_SYNC_ATTEMPTS = 6;
const BATCH_SIZE = 20;

/** Újrapróbálás: 1, 2, 4, 8, 16 perc (legfeljebb egy óra). */
export function syncBackoffMs(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
}

/**
 * Egyirányú szinkron a foglalási rendszerből a Google Naptárba (TICKET-57): outbox-tábla,
 * újrapróbálással. A saját rendszer az igazságforrás: a Google-ban végzett változtatás nem ír
 * vissza, a következő frissítés felülírja. Beállítás nélkül nem kerül tétel a sorba (nem nő a
 * végtelenségig), és nincs hiba: a recepció „nincs beállítva” állapotot lát.
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: GoogleCalendarClient,
  ) {}

  get isConfigured(): boolean {
    return this.client.isConfigured;
  }

  /**
   * A foglalás változásának sorba állítása a foglalással egy tranzakcióban. Foglalásonként
   * legfeljebb egy függő tétel van: az újabb változás azt frissíti (a törlés felülírja).
   */
  async enqueue(
    tx: Tx,
    studioId: string,
    bookingIds: readonly string[],
    operation: 'UPSERT' | 'DELETE',
  ): Promise<void> {
    if (!this.isConfigured) return;
    for (const bookingId of new Set(bookingIds)) {
      const pending = await tx.calendarSyncOutbox.findFirst({
        where: { bookingId, status: 'PENDING' },
      });
      if (pending) {
        await tx.calendarSyncOutbox.update({
          where: { id: pending.id },
          data: { operation, attempts: 0, nextAttemptAt: new Date(), lastError: null },
        });
      } else {
        await tx.calendarSyncOutbox.create({ data: { studioId, bookingId, operation } });
      }
    }
  }

  /** Az esedékes tételek feldolgozása; ismételhető (a tétel csak siker után DONE). */
  async processDue(now: Date = new Date()): Promise<{ done: number; failed: number }> {
    if (!this.isConfigured) return { done: 0, failed: 0 };
    const items = await this.prisma.calendarSyncOutbox.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH_SIZE,
    });

    let done = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await this.syncItem(item.bookingId, item.operation);
        await this.prisma.calendarSyncOutbox.update({
          where: { id: item.id },
          data: { status: 'DONE', processedAt: now, lastError: null },
        });
        done++;
      } catch (err) {
        const attempts = item.attempts + 1;
        const exhausted = attempts >= MAX_SYNC_ATTEMPTS;
        await this.prisma.calendarSyncOutbox.update({
          where: { id: item.id },
          data: {
            attempts,
            status: exhausted ? 'FAILED' : 'PENDING',
            nextAttemptAt: new Date(now.getTime() + syncBackoffMs(attempts)),
            lastError: (err as Error).message.slice(0, 500),
          },
        });
        if (exhausted) failed++;
        this.logger.warn(`Google Naptár szinkron sikertelen (${item.bookingId}): ${(err as Error).message}`);
      }
    }
    return { done, failed };
  }

  private async syncItem(bookingId: string, operation: 'UPSERT' | 'DELETE'): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return;
    const eventId = booking.googleEventId ?? calendarEventIdFor(booking.id);

    if (operation === 'DELETE' || booking.status === 'CANCELLED') {
      await this.client.deleteEvent(eventId);
      return;
    }

    const [guest, treatment, resource] = await Promise.all([
      this.prisma.guest.findUnique({ where: { id: booking.guestId } }),
      this.prisma.bookableTreatment.findUnique({ where: { id: booking.treatmentId } }),
      this.prisma.bookingResource.findUnique({ where: { id: booking.resourceId } }),
    ]);
    // Csak név és kezelés: telefonszám, e-mail és bérletadat nem kerül a Google-ba.
    const guestName = guest ? `${guest.lastName} ${guest.firstName}` : 'Vendég';
    await this.client.upsertEvent(eventId, {
      summary: `${treatment?.name ?? 'Kezelés'} – ${guestName}`,
      description: [
        `Gép: ${resource?.name ?? '-'}`,
        `Állapot: ${BOOKING_STATUS_LABELS[booking.status as BookingStatusValue] ?? booking.status}`,
        'A Re-Form Stúdió foglalási rendszeréből szinkronizálva; az itt végzett módosítás nem kerül vissza.',
      ].join('\n'),
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
    });
    if (!booking.googleEventId) {
      await this.prisma.booking.update({ where: { id: booking.id }, data: { googleEventId: eventId } });
    }
  }

  async status(studioId: string): Promise<CalendarSyncStatusDto> {
    if (!this.isConfigured) {
      return { configured: false, pending: 0, failed: 0, lastSyncedAt: null, failures: [] };
    }
    const [pending, failures, last] = await Promise.all([
      this.prisma.calendarSyncOutbox.count({ where: { studioId, status: 'PENDING' } }),
      this.prisma.calendarSyncOutbox.findMany({
        where: { studioId, status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.calendarSyncOutbox.findFirst({
        where: { studioId, status: 'DONE' },
        orderBy: { processedAt: 'desc' },
      }),
    ]);
    return {
      configured: true,
      pending,
      failed: failures.length,
      lastSyncedAt: last?.processedAt?.toISOString() ?? null,
      failures: failures.map((f) => ({
        id: f.id,
        bookingId: f.bookingId,
        operation: f.operation,
        attempts: f.attempts,
        lastError: f.lastError,
        updatedAt: f.updatedAt.toISOString(),
      })),
    };
  }

  /** A sikertelen tételek újra a sorba (recepciós „Újrapróbálás”). */
  async retryFailed(studioId: string): Promise<number> {
    if (!this.isConfigured) return 0;
    const { count } = await this.prisma.calendarSyncOutbox.updateMany({
      where: { studioId, status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
    });
    return count;
  }
}
