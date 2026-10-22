import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  CheckInWarningCode,
  DEFAULT_STUDIO_ID,
  EXPIRING_SOON_THRESHOLD_DAYS,
  GuestPassDto,
  PassTemplateDto,
  PassType,
  PassUsageLogDto,
  ServiceCategory,
  ServiceDto,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorGateway } from '../monitor/monitor.gateway';
import {
  CreatePassTemplateDto,
  CreateServiceDto,
  DeductPassUsageDto,
  ExtendPassDto,
  ReversePassUsageDto,
  SellPassDto,
  ToggleFreezePassDto,
  UpdatePassTemplateDto,
} from './passes.dto';

@Injectable()
export class PassesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly monitorGateway?: MonitorGateway,
  ) {}

  async listServices(
    includeInactive = false,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<ServiceDto[]> {
    const services = await this.prisma.service.findMany({
      where: {
        studioId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });

    return services.map((s) => ({
      id: s.id,
      studioId: s.studioId,
      name: s.name,
      category: s.category as unknown as ServiceCategory,
      durationMinutes: s.durationMinutes,
      priceHuf: s.priceHuf,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async createService(
    dto: CreateServiceDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<ServiceDto> {
    const created = await this.prisma.service.create({
      data: {
        studioId,
        name: dto.name.trim(),
        category: dto.category,
        durationMinutes: dto.durationMinutes,
        priceHuf: dto.priceHuf,
      },
    });

    return {
      id: created.id,
      studioId: created.studioId,
      name: created.name,
      category: created.category as unknown as ServiceCategory,
      durationMinutes: created.durationMinutes,
      priceHuf: created.priceHuf,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listTemplates(
    includeInactive = false,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<PassTemplateDto[]> {
    const templates = await this.prisma.passTemplate.findMany({
      where: {
        studioId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { service: true },
      orderBy: { price: 'asc' },
    });

    return templates.map((t) => ({
      id: t.id,
      studioId: t.studioId,
      serviceId: t.serviceId,
      serviceName: t.service?.name ?? null,
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
        serviceId: dto.serviceId || null,
        name: dto.name.trim(),
        type: dto.type,
        totalPasses:
          dto.type === PassType.OCCASION_BASED ? (dto.totalPasses ?? 1) : null,
        durationDays: dto.durationDays,
        price: dto.price,
      },
      include: { service: true },
    });

    return {
      id: created.id,
      studioId: created.studioId,
      serviceId: created.serviceId,
      serviceName: created.service?.name ?? null,
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
      include: { service: true },
    });

    return {
      id: updated.id,
      studioId: updated.studioId,
      serviceId: updated.serviceId,
      serviceName: updated.service?.name ?? null,
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
        include: { service: true },
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
          serviceId: template.serviceId ?? null,
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
          service: true,
        },
      });

      await tx.passUsageLog.create({
        data: {
          guestPassId: guestPass.id,
          guestId: guest.id,
          serviceId: template.serviceId ?? null,
          employeeId: staffUserId,
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

      await tx.paymentAllocation
        .create({
          data: {
            paymentId: payment.id,
            passId: guestPass.id,
            amountHuf: Math.round(amount),
          },
        })
        .catch(() => null);

      return {
        pass: this.mapPass(guestPass),
        paymentId: payment.id,
        amount: Number(payment.amount),
      };
    });
  }

  /**
   * 2.4 Alkalmas kezelés: Recepciós kézzel kiválasztja a kezelést és az aktív bérletet.
   * Szerver ellenőrzi a jogosultságot, lejáratot és alkalomszámot -> atomi tranzakciós levonás ->
   * Vendégmonitor: "Üdvözlünk, Kovács Anna! Hypoxi. Hátralévő alkalmak: 6. Kellemes kezelést kívánunk!"
   * 1–2 alkalomnál, lejáratkor és kimerüléskor recepciós figyelmeztetés.
   */
  async deductTreatmentUsage(
    dto: DeductPassUsageDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<CheckInResultPayload> {
    const now = new Date();

    const payload = await this.prisma.$transaction(async (tx) => {
      if (dto.operationKey) {
        const existingOp = await tx.passUsageLog.findUnique({
          where: { operationKey: dto.operationKey },
          include: {
            guest: true,
            service: true,
            guestPass: { include: { passTemplate: true } },
          },
        });
        if (existingOp && existingOp.guest) {
          return {
            usageId: existingOp.id,
            mode: 'TREATMENT_GREETING' as const,
            status: CheckInStatus.SUCCESS,
            guestId: existingOp.guestId ?? undefined,
            barcode: existingOp.guest.barcode,
            guestName: `${existingOp.guest.lastName} ${existingOp.guest.firstName}`,
            serviceName:
              existingOp.service?.name ??
              existingOp.guestPass.passTemplate.name,
            passName: existingOp.guestPass.passTemplate.name,
            passType: existingOp.guestPass.type as unknown as PassType,
            remainingPasses:
              existingOp.guestPass.type === 'TIME_BASED'
                ? ('Korlátlan' as const)
                : (existingOp.guestPass.remainingPasses ?? 0),
            totalPasses: existingOp.guestPass.totalPasses,
            expirationDate: existingOp.guestPass.expirationDate.toISOString(),
            warnings: [],
            suggestedRenewalTemplateId: existingOp.guestPass.passTemplateId,
            timestamp: existingOp.usedAt.toISOString(),
          } satisfies CheckInResultPayload;
        }
      }

      const guest = await tx.guest.findFirst({
        where: { id: dto.guestId, studioId },
      });
      if (!guest || !guest.isActive) {
        throw new NotFoundException('A kiválasztott vendég nem található vagy inaktív.');
      }

      const pass = await tx.guestPass.findFirst({
        where: { id: dto.passId, guestId: guest.id, studioId },
        include: { passTemplate: true, usageLogs: true },
      });
      if (!pass) {
        throw new NotFoundException('A kiválasztott bérlet nem található.');
      }

      const service = await tx.service.findFirst({
        where: { id: dto.serviceId, studioId },
      });
      const serviceName = service?.name ?? pass.passTemplate.name;

      if (pass.isFrozen) {
        throw new BadRequestException(
          'Ez a bérlet jelenleg fagyasztva van (szünetel), nem vonható le belőle alkalom.',
        );
      }

      if (!pass.isActive || pass.expirationDate < now) {
        throw new BadRequestException(
          'A kiválasztott bérlet lejárt vagy inaktív!',
        );
      }

      // Fennmaradó alkalmak ellenőrzése a nem visszavont felhasználásokból is
      const activeDeductions = (pass.usageLogs ?? []).filter(
        (u) => u.delta < 0 && !u.reversedAt,
      ).length;
      const computedRemaining =
        pass.totalPasses !== null
          ? Math.max(0, pass.totalPasses - activeDeductions)
          : (pass.remainingPasses ?? 0);

      let newRemaining: number | 'Korlátlan' = 'Korlátlan';

      if (pass.type === 'OCCASION_BASED') {
        if ((pass.remainingPasses ?? computedRemaining) <= 0) {
          throw new BadRequestException(
            'A bérleten elfogytak a felhasználható alkalmak (0 maradt)!',
          );
        }

        const atomicUpdate = await tx.guestPass.updateMany({
          where: {
            id: pass.id,
            isActive: true,
            isFrozen: false,
            remainingPasses: { gt: 0 },
          },
          data: {
            remainingPasses: { decrement: 1 },
          },
        });

        if (atomicUpdate.count !== 1) {
          throw new ConflictException(
            'Versenyhelyzet észlelve: a bérlet egyenlege időközben módosult, nem történt túlfogyasztás.',
          );
        }

        const calcRem = (pass.remainingPasses ?? computedRemaining) - 1;
        newRemaining = calcRem;

        if (calcRem <= 0) {
          await tx.guestPass.update({
            where: { id: pass.id },
            data: { isActive: false },
          });
        }
      }

      const usageLog = await tx.passUsageLog.create({
        data: {
          guestPassId: pass.id,
          guestId: guest.id,
          serviceId: service?.id ?? null,
          employeeId: staffUserId,
          delta: -1,
          operationKey: dto.operationKey ?? null,
          note: dto.note?.trim() || `Kezelés: ${serviceName}`,
        },
      });

      await tx.visit
        .create({
          data: {
            studioId,
            guestId: guest.id,
            visitType: 'TREATMENT',
            employeeId: staffUserId,
          },
        })
        .catch(() => null);

      const checkInLog = await tx.loggedCheckIn.create({
        data: {
          studioId,
          guestId: guest.id,
          guestPassId: pass.id,
          userId: staffUserId,
          visitType: 'TREATMENT',
          status: 'SUCCESS',
          reason: `Kezelés: ${serviceName}`,
        },
      });

      const warnings: CheckInWarningCode[] = [];
      if (pass.type === 'OCCASION_BASED' && typeof newRemaining === 'number') {
        if (newRemaining === 0) {
          warnings.push('DEPLETED_PASS');
          warnings.push('LAST_OCCASION');
        } else if (newRemaining === 1) {
          warnings.push('LAST_OCCASION');
        } else if (newRemaining === 2) {
          warnings.push('LOW_OCCASIONS');
        }
      }

      const daysLeft = Math.ceil(
        (pass.expirationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysLeft <= EXPIRING_SOON_THRESHOLD_DAYS) {
        warnings.push('EXPIRING_SOON');
      }

      return {
        checkInId: checkInLog.id,
        usageId: usageLog.id,
        mode: 'TREATMENT_GREETING' as const,
        status: CheckInStatus.SUCCESS,
        guestId: guest.id,
        barcode: guest.barcode,
        guestName: `${guest.lastName} ${guest.firstName}`,
        serviceName,
        passName: pass.passTemplate.name,
        passType: pass.type as unknown as PassType,
        remainingPasses: newRemaining,
        totalPasses: pass.totalPasses,
        expirationDate: pass.expirationDate.toISOString(),
        warnings,
        suggestedRenewalTemplateId: pass.passTemplateId,
        timestamp: now.toISOString(),
      } satisfies CheckInResultPayload;
    });

    this.monitorGateway?.emitCheckInResult(payload, studioId);
    return payload;
  }

  /**
   * Téves levonás visszavonása (POST /api/pass-usages/:id/reverse)
   * Kötelező indoklással, audit naplózással és a fennmaradó alkalmak helyes újraszámításával.
   */
  async reversePassUsage(
    usageId: string,
    dto: ReversePassUsageDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<CheckInRevokedPayload> {
    const payload = await this.prisma.$transaction(async (tx) => {
      const usage = await tx.passUsageLog.findFirst({
        where: { id: usageId },
        include: {
          guestPass: { include: { guest: true, passTemplate: true } },
          service: true,
        },
      });

      if (!usage || usage.guestPass.studioId !== studioId) {
        throw new NotFoundException('A kezelési levonás nem található.');
      }

      if (usage.reversedAt) {
        throw new BadRequestException('Ez a levonás már korábban vissza lett vonva.');
      }

      if (usage.delta >= 0) {
        throw new BadRequestException('Csak alkalomlevonási tétel vonható vissza.');
      }

      const now = new Date();
      await tx.passUsageLog.update({
        where: { id: usage.id },
        data: {
          reversedAt: now,
          reversalReason: dto.reversalReason.trim(),
        },
      });

      let restoredRemaining: number | 'Korlátlan' = 'Korlátlan';
      if (usage.guestPass.type === 'OCCASION_BASED') {
        const updatedPass = await tx.guestPass.update({
          where: { id: usage.guestPassId },
          data: {
            remainingPasses: { increment: 1 },
            isActive: usage.guestPass.expirationDate >= now,
          },
        });
        restoredRemaining = updatedPass.remainingPasses ?? 1;
      }

      await tx.auditLog
        .create({
          data: {
            studioId,
            userId: staffUserId,
            action: 'PASS_USAGE_REVERSED',
            entityType: 'PassUsageLog',
            entityId: usage.id,
            details: `Alkalomlevonás visszavonva (${usage.guestPass.guest.lastName} ${usage.guestPass.guest.firstName}): ${dto.reversalReason.trim()}`,
          },
        })
        .catch(() => null);

      return {
        checkInId: usage.id,
        guestId: usage.guestPass.guestId,
        guestName: `${usage.guestPass.guest.lastName} ${usage.guestPass.guest.firstName}`,
        serviceName: usage.service?.name ?? usage.guestPass.passTemplate.name,
        restoredRemainingPasses: restoredRemaining,
        timestamp: now.toISOString(),
      } satisfies CheckInRevokedPayload;
    });

    this.monitorGateway?.emitCheckInRevoked(payload, studioId);
    return payload;
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
          guestId: pass.guestId,
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
            guestId: pass.guestId,
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
            guestId: pass.guestId,
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
    const usageLogs: PassUsageLogDto[] = (p.usageLogs ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (l: any) => ({
        id: l.id,
        guestPassId: l.guestPassId,
        guestId: l.guestId ?? p.guestId,
        serviceId: l.serviceId ?? null,
        serviceName: l.service?.name ?? null,
        employeeId: l.employeeId ?? null,
        employeeName: l.employee?.name ?? null,
        delta: l.delta,
        usedAt: l.usedAt.toISOString(),
        reversedAt: l.reversedAt ? l.reversedAt.toISOString() : null,
        reversalReason: l.reversalReason ?? null,
        note: l.note,
      }),
    );

    const usedPassesCount = usageLogs.filter(
      (u) => u.delta < 0 && !u.reversedAt,
    ).length;
    const calculatedRemainingPasses =
      p.totalPasses !== null && p.totalPasses !== undefined
        ? Math.max(0, p.totalPasses - usedPassesCount)
        : null;

    return {
      id: p.id,
      studioId: p.studioId,
      guestId: p.guestId,
      passTemplateId: p.passTemplateId,
      passTemplateName: p.passTemplate?.name,
      serviceId: p.serviceId ?? p.passTemplate?.serviceId ?? null,
      serviceName: p.service?.name ?? p.passTemplate?.service?.name ?? null,
      type: p.type as PassType,
      totalPasses: p.totalPasses,
      remainingPasses: p.remainingPasses,
      calculatedRemainingPasses,
      usedPassesCount,
      startDate: p.startDate.toISOString(),
      expirationDate: p.expirationDate.toISOString(),
      isActive: p.isActive,
      isFrozen: p.isFrozen,
      frozenAt: p.frozenAt ? p.frozenAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      usageLogs,
    };
  }
}
