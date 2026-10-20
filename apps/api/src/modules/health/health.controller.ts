import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

const DB_PING_INTERVAL_MS = 30 * 60 * 1000; // 30 perc

@ApiTags('Health & Keep-Alive')
@Controller('health')
export class HealthController {
  private lastDbPingAt = 0;
  private lastDbStatus: 'OK' | 'SKIPPED' | 'ERROR' = 'SKIPPED';

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary:
      'UptimeRobot Keep-Alive végpont (30 percenkénti SELECT 1 Supabase ébrentartással)',
  })
  async checkHealth() {
    const now = Date.now();
    let dbPingTriggered = false;

    if (now - this.lastDbPingAt >= DB_PING_INTERVAL_MS) {
      dbPingTriggered = true;
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        this.lastDbPingAt = now;
        this.lastDbStatus = 'OK';
      } catch {
        this.lastDbStatus = 'ERROR';
      }
    }

    return {
      status: 'ok',
      service: 'reform-studio-api',
      timestamp: new Date(now).toISOString(),
      dbKeepAlive: {
        triggeredNow: dbPingTriggered,
        lastStatus: this.lastDbStatus,
        lastPingAt:
          this.lastDbPingAt > 0
            ? new Date(this.lastDbPingAt).toISOString()
            : null,
      },
    };
  }
}
