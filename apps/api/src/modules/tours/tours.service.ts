import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  applyTourEvent,
  readTourState,
  TourEventDto,
  TourStateDto,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';

// Oldalbemutató (TICKET-53): a bejelentkezett fiók látott bemutatói (`users.tour_state`), hogy a
// felajánlás másik gépen se jöjjön újra. Az esemény szabálya a közös `applyTourEvent`.
@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<TourStateDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tourState: true },
    });
    return { seen: readTourState(user?.tourState).seen };
  }

  async recordEvent(userId: string, event: TourEventDto): Promise<TourStateDto> {
    return this.prisma.$transaction(async (tx) => {
      // Sorzár: az egyszerre érkező események (pl. két lap) ne írják felül egymást.
      const [row] = await tx.$queryRaw<{ tour_state: Prisma.JsonValue }[]>`
        SELECT "tour_state" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      if (!row) return { seen: [] };
      const current = readTourState(row.tour_state);
      const next = applyTourEvent(current, event);
      if (next !== current) {
        await tx.user.update({
          where: { id: userId },
          data: { tourState: next },
        });
      }
      return { seen: next.seen };
    });
  }
}
