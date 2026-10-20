import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorGateway } from '../monitor/monitor.gateway';
import { ScanCheckInDto, SyncOfflineScansDto } from './check-ins.dto';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitorGateway: MonitorGateway,
  ) {}

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
        },
      });

      if (!guest || !guest.isActive) {
        throw new BadRequestException(
          `Nem található aktív vendég a(z) "${barcode}" vonalkóddal.`,
        );
      }

      const guestFullName = `${guest.lastName} ${guest.firstName}`;

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

      if (!activePass) {
        const hasFrozenPass = guest.passes.some(
          (p) => p.isActive && p.isFrozen && p.expirationDate >= now,
        );
        const deniedReason = hasFrozenPass
          ? 'A vendég bérlete jelenleg fagyasztva van (szünetel).'
          : 'Nincs érvényes bérlet (lejárt vagy elfogytak az alkalmak)!';

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
          status: CheckInStatus.DENIED,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          reason: deniedReason,
          warnings: [],
          suggestedRenewalTemplateId: lastKnownPass?.passTemplateId ?? null,
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      let newRemaining: number | 'Korlátlan' = 'Korlátlan';

      if (activePass.type === 'OCCASION_BASED') {
        const atomicUpdate = await tx.guestPass.updateMany({
          where: {
            id: activePass.id,
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
            'A bérlet egyenlege időközben módosult. Kérjük, próbáld újra!',
          );
        }

        const calculatedRemaining = (activePass.remainingPasses ?? 1) - 1;
        newRemaining = calculatedRemaining;

        if (calculatedRemaining <= 0) {
          await tx.guestPass.update({
            where: { id: activePass.id },
            data: { isActive: false },
          });
        }

        await tx.passUsageLog.create({
          data: {
            guestPassId: activePass.id,
            delta: -1,
            note: 'Vonalkódos beléptetés',
          },
        });
      }

      const checkInRecord = await tx.loggedCheckIn.create({
        data: {
          studioId,
          guestId: guest.id,
          guestPassId: activePass.id,
          userId: staffUserId,
          status: 'SUCCESS',
          idempotencyKey: dto.idempotencyKey ?? null,
        },
      });

      const warnings: CheckInWarningCode[] = [];
      if (
        activePass.type === 'OCCASION_BASED' &&
        typeof newRemaining === 'number' &&
        newRemaining <= 1
      ) {
        warnings.push('LAST_OCCASION');
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
        status: CheckInStatus.SUCCESS,
        guestId: guest.id,
        barcode: guest.barcode,
        guestName: guestFullName,
        passName: activePass.passTemplate.name,
        passType: activePass.type as unknown as PassType,
        remainingPasses: newRemaining,
        totalPasses: activePass.totalPasses,
        expirationDate: activePass.expirationDate.toISOString(),
        warnings,
        suggestedRenewalTemplateId: activePass.passTemplateId,
        timestamp: now.toISOString(),
      } satisfies CheckInResultPayload;
    });

    // Kizárólag a sikeres adatbázis tranzakció (COMMIT) után küldünk WebSocket eseményt
    this.monitorGateway.emitCheckInResult(resultPayload, studioId);

    return resultPayload;
  }

  async revokeCheckIn(
    checkInId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<CheckInRevokedPayload> {
    const payload = await this.prisma.$transaction(async (tx) => {
      const checkIn = await tx.loggedCheckIn.findFirst({
        where: { id: checkInId, studioId },
        include: {
          guest: true,
          guestPass: true,
        },
      });

      if (!checkIn) {
        throw new NotFoundException('A beléptetési naplóbejegyzés nem található.');
      }

      if (checkIn.status !== 'SUCCESS') {
        throw new BadRequestException(
          'Csak sikeres (SUCCESS) státuszú beléptetés sztornózható.',
        );
      }

      let restoredRemaining: number | 'Korlátlan' = 'Korlátlan';

      if (checkIn.guestPass && checkIn.guestPass.type === 'OCCASION_BASED') {
        const updatedPass = await tx.guestPass.update({
          where: { id: checkIn.guestPass.id },
          data: {
            remainingPasses: { increment: 1 },
            isActive: true,
          },
        });
        restoredRemaining = updatedPass.remainingPasses ?? 1;

        await tx.passUsageLog.create({
          data: {
            guestPassId: checkIn.guestPass.id,
            delta: 1,
            note: 'Recepciós sztornó (téves beléptetés visszavonva)',
          },
        });
      }

      await tx.loggedCheckIn.update({
        where: { id: checkIn.id },
        data: {
          status: 'CANCELLED',
          reason: 'Recepciós által sztornózva',
        },
      });

      return {
        checkInId: checkIn.id,
        guestId: checkIn.guestId,
        guestName: `${checkIn.guest.lastName} ${checkIn.guest.firstName}`,
        restoredRemainingPasses: restoredRemaining,
        timestamp: new Date().toISOString(),
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
      passName: l.guestPass?.passTemplate?.name ?? null,
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
