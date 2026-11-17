import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { EmailAutomationsService } from './email-automations.service';
import { MailOutboxService } from './mail-outbox.service';

/** A kimenő sor percenként néz rá az esedékes levelekre (a korlátot a sor tartja). */
const OUTBOX_INTERVAL_MS = 60 * 1000;
/** A köszöntők óránként: a futás idempotens, a napot a stúdió naptára (Europe/Budapest) adja. */
const AUTOMATION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Időzített levelezés (TICKET-55, a `MembershipDuesScheduler` mintájára): indításkor és utána
 * időközönként. Az állapot (sor, `dedupe_key`) az adatbázisban él, így újraindítás után sem
 * küld kétszer, és a kimaradt napot pótolja.
 */
@Injectable()
export class MailingScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MailingScheduler.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly automations: EmailAutomationsService,
    private readonly outbox: MailOutboxService,
  ) {}

  onApplicationBootstrap(): void {
    void this.runAutomations().then(() => this.runOutbox());
    this.timers = [
      setInterval(() => void this.runOutbox(), OUTBOX_INTERVAL_MS),
      setInterval(() => void this.runAutomations(), AUTOMATION_INTERVAL_MS),
    ];
    for (const timer of this.timers) timer.unref();
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  async runAutomations(): Promise<void> {
    try {
      const queued = await this.automations.runDaily();
      if (queued > 0) this.logger.log(`${queued} köszöntő levél került a sorba`);
    } catch (err) {
      this.logger.error('Az automatikus levelek összeállítása sikertelen', err as Error);
    }
  }

  async runOutbox(): Promise<void> {
    try {
      await this.outbox.processDue();
    } catch (err) {
      this.logger.error('A kimenő sor feldolgozása sikertelen', err as Error);
    }
  }
}
