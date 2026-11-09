import { Injectable } from '@nestjs/common';
import {
  appError,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  CheckInWarningCode,
  DEFAULT_STUDIO_ID,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  EXPIRING_SOON_THRESHOLD_DAYS,
  LoggedCheckInDto,
  OfflineSyncResponseDto,
  PassType,
  VisitType,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorGateway } from '../monitor/monitor.gateway';
import {
  logCorrection,
  recordArrival,
  recordDeduction,
  reverseDeduction,
  voidArrival,
} from '../passes/pass-ledger';
import { ScanCheckInDto, SyncOfflineScansDto } from './check-ins.dto';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitorGateway: MonitorGateway,
  ) {}

  /**
   * 2.3 Köredzéses érkezés (CIRCUIT_TRAINING) vagy általános vonalkódos beléptetés.
   * - Ha a vendégnek van aktív havi köredzés tagsága (Membership) VAGY időkorlátos bérlete (TIME_BASED),
   *   akkor köredzéses érkezést rögzítünk (visits + logged_check_ins) ALKALOMLEVONÁS NÉLKÜL.
   * - A vendégmonitorra a 'CIRCUIT_GREETING' mód megy ki: "Üdvözlünk, [Név]! Jó edzést kívánunk!"
   *   (nem mutat tartozást és nem mutat bérletszámot).
   * - Ha csak alkalom alapú bérlete van (és nem kifejezetten CIRCUIT_TRAINING módot kértek),
   *   akkor kompatibilitási okokból atomi alkalomlevonást is tud végezni.
   */
  async processBarcodeCheckIn(
    dto: ScanCheckInDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<CheckInResultPayload> {
    const barcode = dto.barcode.trim();
    const now = new Date();

    const resultPayload = await this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existingByKey = await tx.loggedCheckIn.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: {
            guest: true,
            guestPass: { include: { passTemplate: true } },
          },
        });

        if (existingByKey) {
          return {
            checkInId: existingByKey.id,
            mode:
              existingByKey.visitType === 'CIRCUIT_TRAINING'
                ? ('CIRCUIT_GREETING' as const)
                : ('TREATMENT_GREETING' as const),
            status: existingByKey.status as unknown as CheckInStatus,
            guestId: existingByKey.guestId,
            barcode: existingByKey.guest.barcode,
            guestName: `${existingByKey.guest.lastName} ${existingByKey.guest.firstName}`,
            passName: existingByKey.guestPass?.passTemplate?.name,
            passType: existingByKey.guestPass?.type as unknown as PassType,
            remainingPasses:
              existingByKey.guestPass?.type === 'TIME_BASED'
                ? ('Korlátlan' as const)
                : (existingByKey.guestPass?.remainingPasses ?? 0),
            totalPasses: existingByKey.guestPass?.totalPasses ?? null,
            expirationDate:
              existingByKey.guestPass?.expirationDate.toISOString() ?? null,
            reason: existingByKey.reason ?? undefined,
            warnings: [],
            suggestedRenewalTemplateId:
              existingByKey.guestPass?.passTemplateId ?? null,
            timestamp: existingByKey.createdAt.toISOString(),
          } satisfies CheckInResultPayload;
        }
      }

      const guest = await tx.guest.findUnique({
        where: {
          studioId_barcode: {
            studioId,
            barcode,
          },
        },
        include: {
          passes: {
            include: { passTemplate: true },
            orderBy: { expirationDate: 'asc' },
          },
          memberships: {
            include: { dues: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!guest || !guest.isActive) {
        throw appError('CHECKIN.GUEST_NOT_FOUND', {
          message: `Nem található aktív vendég a(z) "${barcode}" vonalkóddal.`,
        });
      }

      const guestFullName = `${guest.lastName} ${guest.firstName}`;

      // 10 másodperces dupla leolvasás védelem
      if (!dto.forceDuplicate) {
        const cooldownSince = new Date(
          now.getTime() - DUPLICATE_SCAN_COOLDOWN_SECONDS * 1000,
        );
        const recentCheckIn = await tx.loggedCheckIn.findFirst({
          where: {
            studioId,
            guestId: guest.id,
            status: 'SUCCESS',
            createdAt: { gte: cooldownSince },
          },
          include: {
            guestPass: { include: { passTemplate: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (recentCheckIn) {
          return {
            checkInId: recentCheckIn.id,
            mode: 'CIRCUIT_GREETING',
            status: CheckInStatus.DUPLICATE_SCAN,
            guestId: guest.id,
            barcode: guest.barcode,
            guestName: guestFullName,
            passName: recentCheckIn.guestPass?.passTemplate?.name,
            passType: recentCheckIn.guestPass?.type as unknown as PassType,
            remainingPasses:
              recentCheckIn.guestPass?.type === 'TIME_BASED'
                ? ('Korlátlan' as const)
                : (recentCheckIn.guestPass?.remainingPasses ?? 0),
            totalPasses: recentCheckIn.guestPass?.totalPasses ?? null,
            expirationDate:
              recentCheckIn.guestPass?.expirationDate.toISOString() ?? null,
            reason: `${guestFullName} már beléptetve az elmúlt ${DUPLICATE_SCAN_COOLDOWN_SECONDS} másodpercben (nem történt újabb levonás).`,
            warnings: [],
            suggestedRenewalTemplateId:
              recentCheckIn.guestPass?.passTemplateId ?? null,
            timestamp: now.toISOString(),
          } satisfies CheckInResultPayload;
        }
      }

      // Ellenőrizzük a havi tagságot és az esetleges elmaradásokat (tartozásokat) a recepciós számára
      const activeMembership = (guest.memberships ?? []).find(
        (m) => m.status === 'ACTIVE',
      );
      const pausedMembership = (guest.memberships ?? []).find(
        (m) => m.status === 'PAUSED',
      );

      let overdueAmountHuf = 0;
      let maxOverdueDays = 0;
      for (const m of guest.memberships ?? []) {
        for (const d of m.dues ?? []) {
          if (d.status === 'PAID' || d.status === 'WAIVED') continue;
          const rem = Math.max(0, d.amountHuf - d.paidAmountHuf);
          if (rem > 0 && d.dueDate < now) {
            overdueAmountHuf += rem;
            const days = Math.ceil(
              (now.getTime() - d.dueDate.getTime()) / (24 * 60 * 60 * 1000),
            );
            if (days > maxOverdueDays) maxOverdueDays = days;
          }
        }
      }

      const warnings: CheckInWarningCode[] = [];
      if (overdueAmountHuf > 0) {
        warnings.push('OVERDUE_DUES');
      }
      if (pausedMembership && !activeMembership) {
        warnings.push('MEMBERSHIP_PAUSED');
      }

      // Ha kifejezetten köredzéses érkezés vagy van aktív havi tagsága: nincs alkalomlevonás!
      if (dto.visitType === VisitType.CIRCUIT_TRAINING && activeMembership) {
        const checkInRecord = await recordArrival(tx, {
          studioId,
          guestId: guest.id,
          guestPassId: null,
          staffUserId,
          visitType: 'CIRCUIT_TRAINING',
          idempotencyKey: dto.idempotencyKey,
        });

        return {
          checkInId: checkInRecord.id,
          mode: 'CIRCUIT_GREETING',
          status: CheckInStatus.SUCCESS,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          serviceName: 'Köredzés',
          passName: `Havi Köredzés Tagság (${activeMembership.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó)`,
          remainingPasses: 'Korlátlan',
          warnings,
          overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
          overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      const validPasses = guest.passes.filter((p) => {
        if (!p.isActive || p.isFrozen) return false;
        if (p.startDate > now || p.expirationDate < now) return false;
        if (p.type === 'TIME_BASED') return true;
        return p.type === 'OCCASION_BASED' && (p.remainingPasses ?? 0) > 0;
      });

      validPasses.sort((a, b) => {
        if (a.type === 'TIME_BASED' && b.type !== 'TIME_BASED') return -1;
        if (a.type !== 'TIME_BASED' && b.type === 'TIME_BASED') return 1;
        return a.expirationDate.getTime() - b.expirationDate.getTime();
      });

      const activePass = validPasses[0];

      // Ha nincs aktív bérlete, de van aktív havi tagsága -> köredzéses beléptetés alkalomlevonás nélkül
      if (!activePass && activeMembership) {
        const checkInRecord = await recordArrival(tx, {
          studioId,
          guestId: guest.id,
          guestPassId: null,
          staffUserId,
          visitType: 'CIRCUIT_TRAINING',
          idempotencyKey: dto.idempotencyKey,
        });

        return {
          checkInId: checkInRecord.id,
          mode: 'CIRCUIT_GREETING',
          status: CheckInStatus.SUCCESS,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          serviceName: 'Köredzés',
          passName: `Havi Köredzés Tagság (${activeMembership.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó)`,
          remainingPasses: 'Korlátlan',
          warnings,
          overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
          overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      if (!activePass) {
        const hasFrozenPass = guest.passes.some(
          (p) => p.isActive && p.isFrozen && p.expirationDate >= now,
        );
        const deniedReason = hasFrozenPass
          ? 'A vendég bérlete jelenleg fagyasztva van (szünetel).'
          : pausedMembership
            ? 'A vendég havi tagsága jelenleg szüneteltetve van.'
            : 'Nincs érvényes bérlet vagy aktív tagság (lejárt vagy elfogytak az alkalmak)!';

        const lastKnownPass = guest.passes[guest.passes.length - 1];

        const deniedLog = await tx.loggedCheckIn.create({
          data: {
            studioId,
            guestId: guest.id,
            guestPassId: lastKnownPass?.id ?? null,
            userId: staffUserId,
            status: 'DENIED',
            reason: deniedReason,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });

        return {
          checkInId: deniedLog.id,
          mode: 'CIRCUIT_GREETING',
          status: CheckInStatus.DENIED,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          reason: deniedReason,
          warnings,
          overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
          overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
          suggestedRenewalTemplateId: lastKnownPass?.passTemplateId ?? null,
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      let newRemaining: number | 'Korlátlan' = 'Korlátlan';
      const isCircuitMode =
        dto.visitType === VisitType.CIRCUIT_TRAINING ||
        activePass.type === 'TIME_BASED';

      const checkInRecord = await recordArrival(tx, {
        studioId,
        guestId: guest.id,
        guestPassId: activePass.id,
        staffUserId,
        visitType: isCircuitMode ? 'CIRCUIT_TRAINING' : 'TREATMENT',
        idempotencyKey: dto.idempotencyKey,
      });

      if (!isCircuitMode && activePass.type === 'OCCASION_BASED') {
        const deduction = await recordDeduction(tx, activePass, {
          guestId: guest.id,
          staffUserId,
          checkInId: checkInRecord.id,
          note: 'Vonalkódos beléptetés',
          balanceChangedError: 'CHECKIN.BALANCE_CHANGED',
        });
        newRemaining = deduction.remaining;
      } else if (activePass.type === 'OCCASION_BASED') {
        newRemaining = activePass.remainingPasses ?? 0;
      }

      if (
        activePass.type === 'OCCASION_BASED' &&
        typeof newRemaining === 'number'
      ) {
        if (newRemaining <= 1) {
          warnings.push('LAST_OCCASION');
        } else if (newRemaining === 2) {
          warnings.push('LOW_OCCASIONS');
        }
      }

      const daysUntilExpiration = Math.ceil(
        (activePass.expirationDate.getTime() - now.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (daysUntilExpiration <= EXPIRING_SOON_THRESHOLD_DAYS) {
        warnings.push('EXPIRING_SOON');
      }

      return {
        checkInId: checkInRecord.id,
        mode: isCircuitMode ? 'CIRCUIT_GREETING' : 'TREATMENT_GREETING',
        status: CheckInStatus.SUCCESS,
        guestId: guest.id,
        barcode: guest.barcode,
        guestName: guestFullName,
        serviceName: isCircuitMode
          ? 'Köredzés'
          : activePass.passTemplate.name,
        passName: activePass.passTemplate.name,
        passType: activePass.type as unknown as PassType,
        remainingPasses: newRemaining,
        totalPasses: activePass.totalPasses,
        expirationDate: activePass.expirationDate.toISOString(),
        warnings,
        overdueAmountHuf: overdueAmountHuf > 0 ? overdueAmountHuf : undefined,
        overdueDays: maxOverdueDays > 0 ? maxOverdueDays : undefined,
        suggestedRenewalTemplateId: activePass.passTemplateId,
        timestamp: now.toISOString(),
      } satisfies CheckInResultPayload;
    });

    this.monitorGateway.emitCheckInResult(resultPayload, studioId);

    return resultPayload;
  }

  /**
   * Téves beléptetés sztornója. Ha tartozik hozzá levonás, azt visszavontnak jelöli és 1 alkalmat
   * jóváír (egyszer — a levonás-visszavonás után már nem sztornózható, és fordítva), a látogatást
   * törli, és naplózza, ki, mikor és miért sztornózott.
   */
  async revokeCheckIn(
    checkInId: string,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
    reason?: string,
  ): Promise<CheckInRevokedPayload> {
    const payload = await this.prisma.$transaction(async (tx) => {
      const checkIn = await tx.loggedCheckIn.findFirst({
        where: { id: checkInId, studioId },
        include: {
          guest: true,
          guestPass: true,
          passUsage: { include: { guestPass: true } },
        },
      });

      if (!checkIn) {
        throw appError('CHECKIN.NOT_FOUND');
      }

      const why = reason?.trim() || 'Téves beléptetés';
      if (
        checkIn.status !== 'SUCCESS' ||
        !(await voidArrival(tx, checkIn, `Recepciós sztornó: ${why}`))
      ) {
        throw appError('CHECKIN.NOT_REVOCABLE');
      }

      const now = new Date();
      let restoredRemaining: number | 'Korlátlan' =
        checkIn.guestPass?.type === 'OCCASION_BASED'
          ? (checkIn.guestPass.remainingPasses ?? 0)
          : 'Korlátlan';

      const usage = checkIn.passUsage;
      const reversesDeduction = !!usage && usage.delta < 0 && !usage.reversedAt;
      if (reversesDeduction) {
        restoredRemaining = await reverseDeduction(
          tx,
          usage,
          `Beléptetés sztornó: ${why}`,
          now,
        );
      }

      const guestName = `${checkIn.guest.lastName} ${checkIn.guest.firstName}`;
      await logCorrection(tx, {
        studioId,
        staffUserId,
        action: 'CHECKIN_REVOKED',
        entityType: 'LoggedCheckIn',
        entityId: checkIn.id,
        details: `Beléptetés sztornózva (${guestName})${reversesDeduction ? ', a levonás visszavonva' : ''}: ${why}`,
      });

      return {
        checkInId: checkIn.id,
        guestId: checkIn.guestId,
        guestName,
        restoredRemainingPasses: restoredRemaining,
        timestamp: now.toISOString(),
      } satisfies CheckInRevokedPayload;
    });

    this.monitorGateway.emitCheckInRevoked(payload, studioId);
    return payload;
  }

  async listTodayCheckIns(
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<LoggedCheckInDto[]> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );

    const logs = await this.prisma.loggedCheckIn.findMany({
      where: {
        studioId,
        createdAt: { gte: startOfDay },
      },
      include: {
        guest: true,
        guestPass: { include: { passTemplate: true } },
        user: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs.map((l) => ({
      id: l.id,
      studioId: l.studioId,
      guestId: l.guestId,
      guestName: `${l.guest.lastName} ${l.guest.firstName}`,
      guestBarcode: l.guest.barcode,
      guestPassId: l.guestPassId,
      passName:
        l.guestPass?.passTemplate?.name ??
        (l.visitType === 'CIRCUIT_TRAINING' ? 'Köredzés érkezés' : null),
      visitType: l.visitType as unknown as VisitType,
      userId: l.userId,
      staffName: l.user.name,
      status: l.status as unknown as CheckInStatus,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  async syncOfflineScans(
    dto: SyncOfflineScansDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<OfflineSyncResponseDto> {
    const results: CheckInResultPayload[] = [];

    for (const item of dto.items) {
      try {
        const res = await this.processBarcodeCheckIn(
          {
            barcode: item.barcode,
            idempotencyKey: item.idempotencyKey,
          },
          staffUserId,
          studioId,
        );
        results.push(res);
      } catch (err) {
        results.push({
          status: CheckInStatus.DENIED,
          barcode: item.barcode,
          guestName: `Ismeretlen (${item.barcode})`,
          reason: (err as Error).message,
          warnings: [],
          timestamp: item.scannedAt,
        });
      }
    }

    return {
      processed: results.length,
      results,
    };
  }
}
