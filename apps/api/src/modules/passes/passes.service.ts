import { Injectable, Optional } from '@nestjs/common';
import {
  appError,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  CheckInWarningCode,
  computeRemainingPasses,
  countActiveDeductions,
  DEFAULT_STUDIO_ID,
  EXPIRING_SOON_THRESHOLD_DAYS,
  frozenDaysBetween,
  isBirthdayToday,
  getPassStatus,
  isPassFreezable,
  isPassOpen,
  passCoversService,
  passDeductionError,
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
  logCorrection,
  recordArrival,
  recordDeduction,
  reverseDeduction,
  voidArrival,
} from './pass-ledger';
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
      throw appError('PASS.TEMPLATE_TOTAL_REQUIRED');
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
      throw appError('PASS.TEMPLATE_NOT_FOUND');
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
        throw appError('GUEST.NOT_FOUND', {
          message: 'A kiválasztott vendég nem található.',
        });
      }

      const template = await tx.passTemplate.findFirst({
        where: { id: dto.passTemplateId, studioId, isActive: true },
        include: { service: true },
      });
      if (!template) {
        throw appError('PASS.TEMPLATE_NOT_FOUND', {
          message: 'A kiválasztott bérletsablon nem található vagy inaktív.',
        });
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
            isBirthday: isBirthdayToday(existingOp.guest.birthDate, now),
            timestamp: existingOp.usedAt.toISOString(),
          } satisfies CheckInResultPayload;
        }
      }

      const guest = await tx.guest.findFirst({
        where: { id: dto.guestId, studioId },
      });
      if (!guest || !guest.isActive) {
        throw appError('GUEST.NOT_FOUND', {
          message: 'A kiválasztott vendég nem található vagy inaktív.',
        });
      }

      const pass = await tx.guestPass.findFirst({
        where: { id: dto.passId, guestId: guest.id, studioId },
        include: { passTemplate: true, usageLogs: true },
      });
      if (!pass) {
        throw appError('PASS.NOT_FOUND', {
          message: 'A kiválasztott bérlet nem található.',
        });
      }

      const service = await tx.service.findFirst({
        where: { id: dto.serviceId, studioId },
      });
      if (!service) {
        throw appError('COMMON.NOT_FOUND', {
          message: 'A kiválasztott kezelés nem található.',
        });
      }
      const serviceName = service.name;

      // Szolgáltatáshoz kötött bérletről csak az adott kezelés vonható le;
      // a szolgáltatáshoz nem kötött (általános alkalmas) bérlet bármely kezelésre használható.
      if (
        !passCoversService(
          pass.serviceId ?? pass.passTemplate.serviceId,
          service.id,
        )
      ) {
        throw appError('PASS.SERVICE_MISMATCH');
      }

      const remaining = computeRemainingPasses(
        pass.totalPasses,
        pass.usageLogs ?? [],
      );
      const status = getPassStatus({ ...pass, remainingPasses: remaining }, now);
      const deductionError = passDeductionError(status);
      if (deductionError) throw appError(deductionError);

      const checkInLog = await recordArrival(tx, {
        studioId,
        guestId: guest.id,
        guestPassId: pass.id,
        staffUserId,
        visitType: 'TREATMENT',
        reason: `Kezelés: ${serviceName}`,
      });

      const { usageId, remaining: newRemaining } = await recordDeduction(
        tx,
        { ...pass, remainingPasses: remaining },
        {
          guestId: guest.id,
          staffUserId,
          checkInId: checkInLog.id,
          serviceId: service.id,
          operationKey: dto.operationKey,
          note: dto.note?.trim() || `Kezelés: ${serviceName}`,
          balanceChangedError: 'PASS.BALANCE_CHANGED',
        },
      );

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
        usageId,
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
        isBirthday: isBirthdayToday(guest.birthDate, now),
        timestamp: now.toISOString(),
      } satisfies CheckInResultPayload;
    });

    this.monitorGateway?.emitCheckInResult(payload, studioId);
    return payload;
  }

  /**
   * Téves levonás visszavonása (POST /api/pass-usages/:id/reverse), kötelező indoklással.
   * Csak `delta < 0` levonás vonható vissza, egyszer. A kapcsolt beléptetés is sztornózódik
   * (és a látogatás törlődik), így a beléptetés-sztornó már nem ír jóvá még egyszer.
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
          checkIn: true,
        },
      });

      if (!usage || usage.guestPass.studioId !== studioId) {
        throw appError('PASS.USAGE_NOT_FOUND');
      }

      if (usage.reversedAt) {
        throw appError('PASS.USAGE_ALREADY_REVERSED');
      }

      if (usage.delta >= 0) {
        throw appError('PASS.USAGE_NOT_REVERSIBLE');
      }

      const now = new Date();
      const reason = dto.reversalReason.trim();
      const restoredRemaining = await reverseDeduction(tx, usage, reason, now);

      const checkInVoided = usage.checkIn
        ? await voidArrival(tx, usage.checkIn, `Levonás visszavonva: ${reason}`)
        : false;

      const guestName = `${usage.guestPass.guest.lastName} ${usage.guestPass.guest.firstName}`;
      await logCorrection(tx, {
        studioId,
        staffUserId,
        action: 'PASS_USAGE_REVERSED',
        entityType: 'PassUsageLog',
        entityId: usage.id,
        details: `Alkalomlevonás visszavonva (${guestName})${checkInVoided ? ', a beléptetés sztornózva' : ''}: ${reason}`,
      });

      return {
        checkInId: usage.checkInId ?? usage.id,
        guestId: usage.guestPass.guestId,
        guestName,
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
        throw appError('PASS.NOT_FOUND');
      }

      const baseDate =
        pass.expirationDate.getTime() > Date.now()
          ? pass.expirationDate
          : new Date();
      const newExpiration = new Date(
        baseDate.getTime() + dto.additionalDays * 24 * 60 * 60 * 1000,
      );

      const shouldActivate = isPassOpen(pass, pass.remainingPasses);

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
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestPassDto> {
    return this.prisma.$transaction(async (tx) => {
      const pass = await tx.guestPass.findFirst({
        where: { id: passId, studioId },
        include: { passTemplate: true, usageLogs: true },
      });

      if (!pass) {
        throw appError('PASS.NOT_FOUND');
      }

      const now = new Date();

      if (!pass.isFrozen) {
        // Csak érvényes bérlet fagyasztható; a feloldás mindig mehet.
        const status = getPassStatus(
          {
            ...pass,
            remainingPasses: computeRemainingPasses(
              pass.totalPasses,
              pass.usageLogs,
            ),
          },
          now,
        );
        if (!isPassFreezable(status)) {
          throw appError('PASS.NOT_FREEZABLE');
        }

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
            employeeId: staffUserId,
            delta: 0,
            note: `Bérlet fagyasztva${dto.note ? `: ${dto.note.trim()}` : ''}`,
          },
        });

        return this.mapPass(updated);
      } else {
        const frozenDays = frozenDaysBetween(pass.frozenAt ?? now, now);
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
            employeeId: staffUserId,
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
        checkInId: l.checkInId ?? null,
        note: l.note,
      }),
    );

    const calculatedRemainingPasses = computeRemainingPasses(
      p.totalPasses,
      usageLogs,
    );

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
      usedPassesCount: countActiveDeductions(usageLogs),
      startDate: p.startDate.toISOString(),
      expirationDate: p.expirationDate.toISOString(),
      isActive: p.isActive,
      isFrozen: p.isFrozen,
      frozenAt: p.frozenAt ? p.frozenAt.toISOString() : null,
      cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
      status: getPassStatus({
        ...p,
        remainingPasses: calculatedRemainingPasses,
      }),
      createdAt: p.createdAt.toISOString(),
      usageLogs,
    };
  }
}
