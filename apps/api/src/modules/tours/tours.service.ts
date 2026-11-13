import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ALL_TOURS, TourEventDto, TourStateDto } from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** A `users.tour_state` oszlop: a látott bemutatók és a lépés, amelynél bezárta őket. */
type StoredTourState = { seen: string[]; closedAt: Record<string, number> };

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A tárolt JSON olvasása; a hibás vagy hiányzó részek üresnek számítanak. */
export function readTourState(value: Prisma.JsonValue | undefined): StoredTourState {
  const state: Record<string, unknown> = isObject(value) ? value : {};
  const seen = Array.isArray(state.seen)
    ? state.seen.filter((id): id is string => typeof id === 'string')
    : [];
  const closedAt = isObject(state.closedAt)
    ? Object.fromEntries(
        Object.entries(state.closedAt).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      )
    : {};
  return { seen, closedAt };
}

/** Az esemény hatása: a `seen` lista ismétlés nélkül bővül (`all` → `*`), a `reset` üríti. */
export function applyTourEvent(
  state: StoredTourState,
  event: TourEventDto,
): StoredTourState {
  if (event.kind === 'reset') return { ...state, seen: [] };
  const id = event.kind === 'all' ? ALL_TOURS : event.id;
  return {
    seen: state.seen.includes(id) ? state.seen : [...state.seen, id],
    closedAt:
      event.kind === 'seen'
        ? { ...state.closedAt, [event.id]: event.step }
        : state.closedAt,
  };
}

// Oldalbemutató (TICKET-53): a bejelentkezett fiók látott bemutatói, hogy a felajánlás másik
// gépen se jöjjön újra.
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
      await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { tourState: true },
      });
      if (!user) return { seen: [] };
      const next = applyTourEvent(readTourState(user.tourState), event);
      await tx.user.update({
        where: { id: userId },
        data: { tourState: next },
      });
      return { seen: next.seen };
    });
  }
}
