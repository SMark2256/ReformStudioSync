import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { FinanceService } from './finance.service';

/** Óránkénti futás: a pótlás idempotens, így a hónapforduló legfeljebb egy órát késik. */
const DUES_SYNC_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Havi tagdíj-esedékességek időzített pótlása (indításkor, majd óránként),
 * hogy a tartozás akkor is létrejöjjön, ha senki nem nyitja meg az adatlapot.
 */
@Injectable()
export class MembershipDuesScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MembershipDuesScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly finance: FinanceService) {}

  onApplicationBootstrap(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), DUES_SYNC_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(): Promise<void> {
    try {
      const created = await this.finance.ensureDuesUpTo();
      if (created > 0) {
        this.logger.log(`${created} új tagdíj-esedékesség jött létre`);
      }
    } catch (err) {
      this.logger.error('Tagdíj-esedékességek pótlása sikertelen', err as Error);
    }
  }
}
