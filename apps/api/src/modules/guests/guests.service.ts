import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_STUDIO_ID, GuestDto, PassType } from '@reform/shared';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGuestDto, UpdateGuestDto } from './guests.dto';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateUniqueBarcode(studioId: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = `RS${randomInt(100000, 999999)}`;
      const exists = await this.prisma.guest.findUnique({
        where: { studioId_barcode: { studioId, barcode: candidate } },
      });
      if (!exists) return candidate;
    }
    return `RS${Date.now().toString().slice(-6)}`;
  }

  async findAll(
    query?: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestDto[]> {
    const q = query?.trim();
    const guests = await this.prisma.guest.findMany({
      where: {
        studioId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { barcode: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        passes: {
          include: {
            passTemplate: true,
            usageLogs: {
              orderBy: { usedAt: 'desc' },
              take: 15,
            },
          },
          orderBy: { expirationDate: 'asc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return guests.map((g) => this.mapGuest(g));
  }

  async findOne(id: string, studioId = DEFAULT_STUDIO_ID): Promise<GuestDto> {
    const guest = await this.prisma.guest.findFirst({
      where: { id, studioId },
      include: {
        passes: {
          include: {
            passTemplate: true,
            usageLogs: {
              orderBy: { usedAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!guest) {
      throw new NotFoundException('A keresett vendég nem található.');
    }

    return this.mapGuest(guest);
  }

  async create(
    dto: CreateGuestDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestDto> {
    const barcode =
      dto.barcode && dto.barcode.trim().length > 0
        ? dto.barcode.trim()
        : await this.generateUniqueBarcode(studioId);

    const existing = await this.prisma.guest.findUnique({
      where: { studioId_barcode: { studioId, barcode } },
    });

    if (existing) {
      throw new ConflictException(
        `A(z) "${barcode}" vonalkód már egy másik vendéghez (${existing.lastName} ${existing.firstName}) tartozik.`,
      );
    }

    const created = await this.prisma.guest.create({
      data: {
        studioId,
        barcode,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        passes: {
          include: { passTemplate: true, usageLogs: true },
        },
      },
    });

    return this.mapGuest(created);
  }

  async update(
    id: string,
    dto: UpdateGuestDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestDto> {
    const existing = await this.prisma.guest.findFirst({
      where: { id, studioId },
    });

    if (!existing) {
      throw new NotFoundException('A vendég nem található.');
    }

    if (dto.barcode && dto.barcode.trim() !== existing.barcode) {
      const collision = await this.prisma.guest.findUnique({
        where: {
          studioId_barcode: { studioId, barcode: dto.barcode.trim() },
        },
      });
      if (collision) {
        throw new ConflictException(
          `A(z) "${dto.barcode.trim()}" vonalkód már foglalt (${collision.lastName} ${collision.firstName}).`,
        );
      }
    }

    const updated = await this.prisma.guest.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: {
        passes: {
          include: { passTemplate: true, usageLogs: true },
        },
      },
    });

    return this.mapGuest(updated);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapGuest(g: any): GuestDto {
    return {
      id: g.id,
      studioId: g.studioId,
      barcode: g.barcode,
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone,
      notes: g.notes,
      isActive: g.isActive,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      passes: (g.passes ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => ({
          id: p.id,
          studioId: p.studioId,
          guestId: p.guestId,
          passTemplateId: p.passTemplateId,
          passTemplateName: p.passTemplate?.name,
          type: p.type as PassType,
          totalPasses: p.totalPasses,
          remainingPasses: p.remainingPasses,
          startDate: p.startDate.toISOString(),
          expirationDate: p.expirationDate.toISOString(),
          isActive: p.isActive,
          isFrozen: p.isFrozen,
          frozenAt: p.frozenAt ? p.frozenAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
          usageLogs: (p.usageLogs ?? []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (l: any) => ({
              id: l.id,
              guestPassId: l.guestPassId,
              delta: l.delta,
              usedAt: l.usedAt.toISOString(),
              note: l.note,
            }),
          ),
        }),
      ),
    };
  }
}
