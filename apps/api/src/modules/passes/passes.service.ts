import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_STUDIO_ID,
  GuestPassDto,
  PassTemplateDto,
  PassType,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePassTemplateDto,
  ExtendPassDto,
  SellPassDto,
  ToggleFreezePassDto,
  UpdatePassTemplateDto,
} from './passes.dto';

@Injectable()
export class PassesService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(
    includeInactive = false,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<PassTemplateDto[]> {
    const templates = await this.prisma.passTemplate.findMany({
      where: {
        studioId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { price: 'asc' },
    });

    return templates.map((t) => ({
      id: t.id,
      studioId: t.studioId,
      name: t.name,
      type: t.type as unknown as PassType,
      totalPasses: t.totalPasses,
      durationDays: t.durationDays,
      price: Number(t.price),
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async createTemplate(
    dto: CreatePassTemplateDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<PassTemplateDto> {
    if (dto.type === PassType.OCCASION_BASED && !dto.totalPasses) {
      throw new BadRequestException(
        'Alkalom alapú bérletnél kötelező megadni az alkalmak számát.',
      );
    }

    const created = await this.prisma.passTemplate.create({
      data: {
        studioId,
        name: dto.name.trim(),
        type: dto.type,
        totalPasses:
          dto.type === PassType.OCCASION_BASED ? (dto.totalPasses ?? 1) : null,
        durationDays: dto.durationDays,
        price: dto.price,
      },
    });

    return {
      id: created.id,
      studioId: created.studioId,
      name: created.name,
      type: created.type as unknown as PassType,
      totalPasses: created.totalPasses,
      durationDays: created.durationDays,
      price: Number(created.price),
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async updateTemplate(
    id: string,
    dto: UpdatePassTemplateDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<PassTemplateDto> {
    const existing = await this.prisma.passTemplate.findFirst({
      where: { id, studioId },
    });
    if (!existing) {
      throw new NotFoundException('A bérletsablon nem található.');
    }

    const updated = await this.prisma.passTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.durationDays !== undefined
          ? { durationDays: dto.durationDays }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return {
      id: updated.id,
      studioId: updated.studioId,
      name: updated.name,
      type: updated.type as unknown as PassType,
      totalPasses: updated.totalPasses,
      durationDays: updated.durationDays,
      price: Number(updated.price),
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async sellPass(
    dto: SellPassDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findFirst({
        where: { id: dto.guestId, studioId },
      });
      if (!guest) {
        throw new NotFoundException('A kiválasztott vendég nem található.');
      }

      const template = await tx.passTemplate.findFirst({
        where: { id: dto.passTemplateId, studioId, isActive: true },
      });
      if (!template) {
        throw new NotFoundException(
          'A kiválasztott bérletsablon nem található vagy inaktív.',
        );
      }

      const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
      const expirationDate = new Date(
        startDate.getTime() + template.durationDays * 24 * 60 * 60 * 1000,
      );
      const amount =
        dto.customAmount !== undefined
          ? dto.customAmount
          : Number(template.price);

      const guestPass = await tx.guestPass.create({
        data: {
          studioId,
          guestId: guest.id,
          passTemplateId: template.id,
          type: template.type,
          totalPasses: template.totalPasses,
          remainingPasses: template.totalPasses,
          startDate,
          expirationDate,
          isActive: true,
          isFrozen: false,
        },
        include: {
          passTemplate: true,
        },
      });

      await tx.passUsageLog.create({
        data: {
          guestPassId: guestPass.id,
          delta: template.totalPasses ?? 0,
          note: `Bérlet vásárlás: ${template.name}${dto.note ? ` (${dto.note})` : ''}`,
        },
      });

      const payment = await tx.payment.create({
        data: {
          studioId,
          guestId: guest.id,
          guestPassId: guestPass.id,
          recordedByUserId: staffUserId,
          amount,
          paymentMethod: dto.paymentMethod,
          note: dto.note?.trim() || `${template.name} értékesítés`,
        },
      });

      return {
        pass: this.mapPass(guestPass),
        paymentId: payment.id,
        amount: Number(payment.amount),
      };
    });
  }

  async extendPass(
    passId: string,
    dto: ExtendPassDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestPassDto> {
    return this.prisma.$transaction(async (tx) => {
      const pass = await tx.guestPass.findFirst({
        where: { id: passId, studioId },
        include: { passTemplate: true },
      });

      if (!pass) {
        throw new NotFoundException('A bérlet nem található.');
      }

      const baseDate =
        pass.expirationDate.getTime() > Date.now()
          ? pass.expirationDate
          : new Date();
      const newExpiration = new Date(
        baseDate.getTime() + dto.additionalDays * 24 * 60 * 60 * 1000,
      );

      const shouldActivate =
        pass.type === 'TIME_BASED' || (pass.remainingPasses ?? 0) > 0;

      const updated = await tx.guestPass.update({
        where: { id: pass.id },
        data: {
          expirationDate: newExpiration,
          isActive: shouldActivate,
        },
        include: { passTemplate: true, usageLogs: true },
      });

      await tx.passUsageLog.create({
        data: {
          guestPassId: pass.id,
          delta: 0,
          note: `Hosszabbítás (+${dto.additionalDays} nap): ${dto.note.trim()}`,
        },
      });

      return this.mapPass(updated);
    });
  }

  async toggleFreezePass(
    passId: string,
    dto: ToggleFreezePassDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestPassDto> {
    return this.prisma.$transaction(async (tx) => {
      const pass = await tx.guestPass.findFirst({
        where: { id: passId, studioId },
        include: { passTemplate: true },
      });

      if (!pass) {
        throw new NotFoundException('A bérlet nem található.');
      }

      const now = new Date();

      if (!pass.isFrozen) {
        const updated = await tx.guestPass.update({
          where: { id: pass.id },
          data: {
            isFrozen: true,
            frozenAt: now,
          },
          include: { passTemplate: true, usageLogs: true },
        });

        await tx.passUsageLog.create({
          data: {
            guestPassId: pass.id,
            delta: 0,
            note: `Bérlet fagyasztva${dto.note ? `: ${dto.note.trim()}` : ''}`,
          },
        });

        return this.mapPass(updated);
      } else {
        const frozenSince = pass.frozenAt ?? now;
        const diffMs = Math.max(0, now.getTime() - frozenSince.getTime());
        const frozenDays = Math.max(
          1,
          Math.ceil(diffMs / (24 * 60 * 60 * 1000)),
        );
        const newExpiration = new Date(
          pass.expirationDate.getTime() + frozenDays * 24 * 60 * 60 * 1000,
        );

        const updated = await tx.guestPass.update({
          where: { id: pass.id },
          data: {
            isFrozen: false,
            frozenAt: null,
            expirationDate: newExpiration,
          },
          include: { passTemplate: true, usageLogs: true },
        });

        await tx.passUsageLog.create({
          data: {
            guestPassId: pass.id,
            delta: 0,
            note: `Fagyasztás feloldva (+${frozenDays} nap jóváírva a lejáratra)`,
          },
        });

        return this.mapPass(updated);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapPass(p: any): GuestPassDto {
    return {
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
    };
  }
}
