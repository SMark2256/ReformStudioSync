import { Injectable } from '@nestjs/common';
import {
  appError,
  ARRIVAL_DENIED_MESSAGES,
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  CheckInWarningCode,
  debtDeniedMessage,
  DEFAULT_STUDIO_ID,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  EXPIRING_SOON_THRESHOLD_DAYS,
  greetingFields,
  isBirthdayToday,
  isOccasionPassType,
  LoggedCheckInDto,
  OfflineSyncResponseDto,
  PassType,
  resolveCheckInAccess,
  ServiceCategory,
  summarizePassDebts,
  VisitType,
  womenOnlyAccess,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorGateway } from '../monitor/monitor.gateway';
import {
  logCorrection,
  recordArrival,
  reverseDeduction,
  voidArrival,
} from '../passes/pass-ledger';
import { PASS_DEBT_INCLUDE, passDebtOf } from '../passes/pass-debt';
import {
  entryDebtInput,
  logCheckInOverride,
  requireOverrideReason,
} from './check-in-override';
import { ScanCheckInDto, SyncOfflineScansDto } from './check-ins.dto';

interface GreetingServiceRow {
  name: string;
  category: string;
  womenOnly: boolean;
}

/**
 * Egy korábbi belépés üdvözlése (dupla beolvasás, idempotens visszajátszás, TICKET-43): kezelésnél
 * a levonás szolgáltatása, köredzésnél a bérlet szolgáltatása, bérlet nélkül a tagságé.
 */
function priorCheckInGreeting(
  checkIn: {
    visitType: string;
    guestPass?: {
      service?: GreetingServiceRow | null;
      passTemplate?: { service?: GreetingServiceRow | null } | null;
    } | null;
    passUsage?: { service?: GreetingServiceRow | null } | null;
  },
  memberships: { status: string; service?: GreetingServiceRow | null }[] = [],
) {
  const isCircuit = checkIn.visitType === 'CIRCUIT_TRAINING';
  const membershipService = checkIn.guestPass
    ? null
    : ((memberships.find((m) => m.status === 'ACTIVE') ?? memberships[0])
        ?.service ?? null);
  const service =
    checkIn.passUsage?.service ??
    checkIn.guestPass?.service ??
    checkIn.guestPass?.passTemplate?.service ??
    (isCircuit ? membershipService : null);
  return {
    mode: isCircuit
      ? ('CIRCUIT_GREETING' as const)
      : ('TREATMENT_GREETING' as const),
    serviceName: service?.name ?? (isCircuit ? 'Köredzés' : undefined),
    ...greetingFields(service, isCircuit ? ServiceCategory.CIRCUIT : null),
  };
}

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitorGateway: MonitorGateway,
  ) {}

  /**
   * 2.3 Vonalkódos beléptetés (TICKET-39). A döntés a közös `resolveArrivalEntitlement`:
   * - aktív havi tagság vagy köredzésre érvényes időalapú bérlet → köredzéses érkezés
   *   (visits + logged_check_ins) ALKALOMLEVONÁS NÉLKÜL, a monitorra 'CIRCUIT_GREETING' megy
   *   a szolgáltatás kategóriájával és `womenOnly` jelzésével (TICKET-43);
   * - csak kezelésre szóló bérlet → TREATMENT_SELECTION_REQUIRED: semmi nem rögzül és a monitor
   *   sem kap eseményt; a levonás a kezelésválasztóból (`deductTreatmentUsage`) történik;
   * - semmi érvényes → elutasítás (DENIED napló).
   * A beolvasás soha nem von le alkalmat, a `visitType` nem befolyásolja a döntést.
   *
   * Tartozás (TICKET-15, `resolveCheckInAccess`): a türelmi időn (5 nap) túli tagdíj-elmaradás,
   * bérlet-hátralék vagy ismeretlen hátralék a belépést és a kezelésválasztást is elutasítja
   * (`overrideAllowed`). Kivételes beengedés: `forceOverride` + kötelező indoklás; köredzésnél a
   * belépéssel együtt `CHECKIN_OVERRIDE` audit íródik, kezelésnél a levonáskor (`deductTreatmentUsage`).
   */
  async processBarcodeCheckIn(
    dto: ScanCheckInDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<CheckInResultPayload> {
    const barcode = dto.barcode.trim();
    const now = new Date();
    const overrideReason = requireOverrideReason(dto);

    const resultPayload = await this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existingByKey = await tx.loggedCheckIn.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: {
            guest: {
              include: {
                memberships: {
                  include: { service: true },
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
            guestPass: {
              include: {
                passTemplate: { include: { service: true } },
                service: true,
              },
            },
            passUsage: { include: { service: true } },
          },
        });

        if (existingByKey) {
          // A korábbi belépés szövege és kategóriája (TICKET-43).
          return {
            checkInId: existingByKey.id,
            ...priorCheckInGreeting(
              existingByKey,
              existingByKey.guest.memberships,
            ),
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
            include: { passTemplate: true, service: true, ...PASS_DEBT_INCLUDE },
            orderBy: { expirationDate: 'asc' },
          },
          memberships: {
            include: { dues: true, service: true },
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
      const isBirthday = isBirthdayToday(guest.birthDate, now);

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
            guestPass: {
              include: {
                passTemplate: { include: { service: true } },
                service: true,
              },
            },
            passUsage: { include: { service: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (recentCheckIn) {
          // A korábbi belépés szövege és kategóriája, nem égetett köredzés (TICKET-43).
          return {
            checkInId: recentCheckIn.id,
            ...priorCheckInGreeting(recentCheckIn, guest.memberships),
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

      // Csak nőknek szóló tagság / bérlet: férfi vendéggel nem számít (TICKET-42).
      // Tartozás a türelmi időn túl: elutasítás, kivételes beengedéssel feloldható (TICKET-15).
      const access = resolveCheckInAccess(
        {
          ...entryDebtInput(guest),
          override: overrideReason !== null,
          guestGender: guest.gender,
          memberships: (guest.memberships ?? []).map((m) => ({
            ...m,
            womenOnly: m.service?.womenOnly ?? false,
          })),
          passes: guest.passes.map((p) => ({
            ...p,
            serviceCategory: p.service?.category ?? null,
            womenOnly: p.service?.womenOnly ?? false,
          })),
        },
        now,
      );
      const { entitlement, debt } = access;

      const warnings: CheckInWarningCode[] = [];
      if (debt.duesOverdueHuf > 0) {
        warnings.push('OVERDUE_DUES');
      }
      if (pausedMembership && !activeMembership) {
        warnings.push('MEMBERSHIP_PAUSED');
      }
      const used =
        entitlement.kind === 'CIRCUIT_MEMBERSHIP'
          ? entitlement.membership
          : entitlement.kind === 'CIRCUIT_PASS'
            ? entitlement.pass
            : null;
      if (
        used &&
        womenOnlyAccess(guest.gender, used.womenOnly) === 'GENDER_MISSING'
      ) {
        warnings.push('GENDER_MISSING');
      }
      // Bérlet-hátralék (TICKET-14) a recepciónak; a tiltás a fenti `access` (TICKET-15).
      const passDebt = summarizePassDebts(
        guest.passes.map((p) => ({ debt: passDebtOf(p), debtSince: p.debtSince })),
      );
      const overdue = {
        overdueAmountHuf: debt.duesOverdueHuf > 0 ? debt.duesOverdueHuf : undefined,
        overdueDays: debt.duesOverdueDays > 0 ? debt.duesOverdueDays : undefined,
        passDebtHuf: passDebt.debtHuf > 0 ? passDebt.debtHuf : undefined,
        passDebtSince: passDebt.since ?? undefined,
        passDebtUnknown: passDebt.hasUnknown || undefined,
        passDebtDays: debt.passDebtDays > 0 ? debt.passDebtDays : undefined,
        overridden: access.overridden || undefined,
      };
      // Kivételes beengedés (TICKET-15): a belépés okaként és auditként is rögzül.
      const arrivalReason = access.overridden
        ? `Kivételes beengedés: ${overrideReason}`
        : null;
      const logOverride = (checkInId: string) =>
        access.overridden && overrideReason
          ? logCheckInOverride(tx, {
              studioId,
              staffUserId,
              checkInId,
              guestId: guest.id,
              guestName: guestFullName,
              debt,
              passDebtHuf: passDebt.debtHuf,
              reason: overrideReason,
            })
          : null;

      // Aktív havi tagság: köredzéses érkezés alkalomlevonás nélkül.
      if (entitlement.kind === 'CIRCUIT_MEMBERSHIP') {
        const checkInRecord = await recordArrival(tx, {
          studioId,
          guestId: guest.id,
          guestPassId: null,
          staffUserId,
          visitType: 'CIRCUIT_TRAINING',
          reason: arrivalReason,
          idempotencyKey: dto.idempotencyKey,
        });
        await logOverride(checkInRecord.id);

        return {
          checkInId: checkInRecord.id,
          mode: 'CIRCUIT_GREETING',
          status: CheckInStatus.SUCCESS,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          serviceName: entitlement.membership.service?.name ?? 'Köredzés',
          ...greetingFields(
            entitlement.membership.service,
            ServiceCategory.CIRCUIT,
          ),
          passName: `Havi Köredzés Tagság (${entitlement.membership.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó)`,
          remainingPasses: 'Korlátlan',
          warnings,
          ...overdue,
          isBirthday,
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      // Köredzésre érvényes időalapú bérlet: köredzéses érkezés a bérletre, alkalomlevonás nélkül.
      if (entitlement.kind === 'CIRCUIT_PASS') {
        const circuitPass = entitlement.pass;
        const checkInRecord = await recordArrival(tx, {
          studioId,
          guestId: guest.id,
          guestPassId: circuitPass.id,
          staffUserId,
          visitType: 'CIRCUIT_TRAINING',
          reason: arrivalReason,
          idempotencyKey: dto.idempotencyKey,
        });
        await logOverride(checkInRecord.id);

        const daysUntilExpiration = Math.ceil(
          (circuitPass.expirationDate.getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (daysUntilExpiration <= EXPIRING_SOON_THRESHOLD_DAYS) {
          warnings.push('EXPIRING_SOON');
        }

        return {
          checkInId: checkInRecord.id,
          mode: 'CIRCUIT_GREETING',
          status: CheckInStatus.SUCCESS,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          // A bérlet valódi szolgáltatása (TICKET-43); szolgáltatás nélküli bérletnél köredzés.
          serviceName: circuitPass.service?.name ?? 'Köredzés',
          ...greetingFields(circuitPass.service, ServiceCategory.CIRCUIT),
          passName: circuitPass.passTemplate.name,
          passType: circuitPass.type as unknown as PassType,
          remainingPasses: 'Korlátlan',
          totalPasses: circuitPass.totalPasses,
          expirationDate: circuitPass.expirationDate.toISOString(),
          warnings,
          ...overdue,
          suggestedRenewalTemplateId: circuitPass.passTemplateId,
          isBirthday,
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      // Csak kezelésre szóló bérlet (TICKET-39): nincs belépés, napló és monitor-esemény sem;
      // a recepción a kezelésválasztó nyílik meg, a levonás és az üdvözlés a megerősítéskor történik.
      if (entitlement.kind === 'TREATMENT_SELECTION') {
        return {
          status: CheckInStatus.TREATMENT_SELECTION_REQUIRED,
          guestId: guest.id,
          barcode: guest.barcode,
          guestName: guestFullName,
          reason:
            'Alkalmas bérlet: a belépés a kezelés kiválasztásával és az alkalom levonásával rögzül.',
          warnings,
          ...overdue,
          treatmentOptions: entitlement.passes.map((p) => ({
            passId: p.id,
            passName: p.passTemplate.name,
            passType: p.type as unknown as PassType,
            serviceId: p.serviceId ?? null,
            serviceName: p.service?.name ?? null,
            remainingPasses:
              p.type === 'TIME_BASED'
                ? ('Korlátlan' as const)
                : (p.remainingPasses ?? 0),
            expirationDate: p.expirationDate.toISOString(),
          })),
          timestamp: now.toISOString(),
        } satisfies CheckInResultPayload;
      }

      const deniedReason = entitlement.overridable
        ? debtDeniedMessage(debt, passDebt.debtHuf)
        : ARRIVAL_DENIED_MESSAGES[entitlement.reason];
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
        deniedReasonCode: entitlement.reason,
        debtReasons: entitlement.overridable ? debt.reasons : undefined,
        overrideAllowed: entitlement.overridable || undefined,
        warnings,
        ...overdue,
        suggestedRenewalTemplateId: lastKnownPass?.passTemplateId ?? null,
        timestamp: now.toISOString(),
      } satisfies CheckInResultPayload;
    });

    if (
      resultPayload.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED
    ) {
      return resultPayload;
    }

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
        checkIn.guestPass && isOccasionPassType(checkIn.guestPass.type)
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

    // A kezelésválasztást igénylő tételek (TREATMENT_SELECTION_REQUIRED) nem rögzülnek:
    // az eredménylistában maradnak, a recepció értesítést ad róluk.
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
      treatmentSelectionRequired: results.filter(
        (r) => r.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED,
      ).length,
      results,
    };
  }
}
