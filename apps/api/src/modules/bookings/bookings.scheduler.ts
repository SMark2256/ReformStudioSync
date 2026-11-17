import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { BookingNotificationsService } from './booking-notifications.service';
import { CalendarSyncService } from './calendar-sync.service';
import { WaitlistService } from './waitlist.service';

/** Percenkénti futás: a várólistás tartás 30 perces, az emlékeztető 24 órás. */
export const BOOKING_JOBS_INTERVAL_MS = 60 * 1000;

/**
 * Foglalási háttérfeladatok (TICKET-57), a `MembershipDuesScheduler` mintájára: a 24 órás
 * emlékeztetők, a lejárt várólistás ajánlatok és a Google Naptár sor. Minden lépés az
 * adatbázis állapotából dolgozik és ismételhető, így újraindítás után sem megy ki kétszer.
 */
@Injectable()
export class BookingsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BookingsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly notifications: BookingNotificationsService,
    private readonly waitlist: WaitlistService,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  onApplicationBootstrap(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), BOOKING_JOBS_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(now: Date = new Date()): Promise<void> {
    // Egyszerre egy futás: a lassú levélküldés nem torlódik egymásra.
    if (this.running) return;
    this.running = true;
    try {
      await this.step('Emlékeztetők', () => this.notifications.sendDueReminders(now));
      await this.step('Várólistás ajánlatok lejárata', () => this.waitlist.expireOffers(now));
      await this.step('Google Naptár szinkron', () => this.calendarSync.processDue(now));
    } finally {
      this.running = false;
    }
  }

  private async step(label: string, task: () => Promise<unknown>): Promise<void> {
    try {
      await task();
    } catch (err) {
      this.logger.error(`${label} sikertelen`, err as Error);
    }
  }
}
