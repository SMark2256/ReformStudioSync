import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  appError,
  DailyFinanceSummaryDto,
  DEFAULT_STUDIO_ID,
  EXPIRING_SOON_THRESHOLD_DAYS,
  getMembershipDueSchedule,
  getMembershipStatusTimestamps,
  getMissingDues,
  getOverdueBucket,
  getOverdueDays,
  isDueRemovableOnStop,
  MembershipDto,
  MembershipDueDto,
  MembershipDueStatus,
  MembershipStatus,
  OverdueBucket,
  OverdueReportDto,
  OverdueSummaryItemDto,
  PaymentDto,
  PaymentMethod,
  RecordPaymentRequestDto,
  stopsBilling,
  TodayDashboardDto,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailySummary(
    dateStr?: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<DailyFinanceSummaryDto> {
    const baseDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      23,
      59,
      59,
      999,
    );

    const payments = await this.prisma.payment.findMany({
      where: {
        studioId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        guest: true,
        guestPass: {
          include: { passTemplate: true },
        },
        recordedBy: true,
        allocations: {
          include: {
            membershipDue: true,
            pass: { include: { passTemplate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byMethod = {
      CASH: 0,
      POS_CARD: 0,
      BANK_TRANSFER: 0,
    };

    let totalRevenue = 0;
    let activeTransactionCount = 0;
    let cancelledTransactionCount = 0;

    const mappedPayments: PaymentDto[] = payments.map((p) => {
      const amount = Number(p.amount);
      const method = p.paymentMethod as unknown as PaymentMethod;

      if (!p.isCancelled) {
        totalRevenue += amount;
        activeTransactionCount++;
        byMethod[method] = (byMethod[method] ?? 0) + amount;
      } else {
        cancelledTransactionCount++;
      }

      const firstDueAlloc = (p.allocations ?? []).find(
        (a) => a.membershipDueId,
      );

      return {
        id: p.id,
        studioId: p.studioId,
        guestId: p.guestId,
        guestName: `${p.guest.lastName} ${p.guest.firstName}`,
        guestPassId: p.guestPassId,
        passName: p.guestPass?.passTemplate?.name ?? null,
        membershipDueId: firstDueAlloc?.membershipDueId ?? null,
        membershipPeriod: firstDueAlloc?.membershipDue?.period ?? null,
        recordedByUserId: p.recordedByUserId,
        recordedByName: p.recordedBy.name,
        amount,
        paymentMethod: method,
        isCancelled: p.isCancelled,
        note: p.note,
        createdAt: p.createdAt.toISOString(),
        allocations: (p.allocations ?? []).map((a) => ({
          id: a.id,
          paymentId: a.paymentId,
          membershipDueId: a.membershipDueId,
          membershipPeriod: a.membershipDue?.period ?? null,
          passId: a.passId,
          passName: a.pass?.passTemplate?.name ?? null,
          amountHuf: a.amountHuf,
        })),
      };
    });

    return {
      date: startOfDay.toISOString().slice(0, 10),
      totalRevenue,
      byMethod,
      activeTransactionCount,
      cancelledTransactionCount,
      payments: mappedPayments,
    };
  }

  /**
   * Önálló befizetés rögzítése (POST /api/payments)
   * Támogatja a havi esedékességhez (MembershipDue - részbefizetés vagy teljes rendezés)
   * vagy bérlethez (GuestPass) történő hozzárendelést (PaymentAllocation).
   */
  async recordPayment(
    dto: RecordPaymentRequestDto,
    staffUserId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<PaymentDto> {
    if (dto.amountHuf <= 0) {
      throw appError('PAYMENT.AMOUNT_NOT_POSITIVE');
    }
    if (dto.membershipDueId && dto.passId) {
      throw appError('PAYMENT.MULTIPLE_TARGETS');
    }

    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findFirst({
        where: { id: dto.guestId, studioId },
      });
      if (!guest) {
        throw appError('GUEST.NOT_FOUND', {
          message: 'A kiválasztott vendég nem található.',
        });
      }

      let noteText = dto.note?.trim() || 'Kézi befizetés';
      let membershipPeriod: string | null = null;

      if (dto.membershipDueId) {
        const due = await tx.membershipDue.findUnique({
          where: { id: dto.membershipDueId },
          include: { membership: true },
        });
        if (!due || due.membership.guestId !== guest.id) {
          throw appError('MEMBERSHIP.DUE_NOT_FOUND');
        }

        const newPaid = due.paidAmountHuf + Math.round(dto.amountHuf);
        const newStatus =
          newPaid >= due.amountHuf
            ? MembershipDueStatus.PAID
            : MembershipDueStatus.PARTIAL;

        await tx.membershipDue.update({
          where: { id: due.id },
          data: {
            paidAmountHuf: newPaid,
            status: newStatus,
          },
        });

        membershipPeriod = due.period;
        if (!dto.note) {
          noteText = `Havi tagdíj befizetés (${due.period})${newStatus === MembershipDueStatus.PARTIAL ? ' [Részbefizetés]' : ''}`;
        }
      }

      const payment = await tx.payment.create({
        data: {
          studioId,
          guestId: guest.id,
          guestPassId: dto.passId ?? null,
          recordedByUserId: staffUserId,
          amount: dto.amountHuf,
          paymentMethod: dto.paymentMethod,
          note: noteText,
        },
        include: {
          guest: true,
          guestPass: { include: { passTemplate: true } },
          recordedBy: true,
        },
      });

      if (dto.membershipDueId || dto.passId) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            membershipDueId: dto.membershipDueId ?? null,
            passId: dto.passId ?? null,
            amountHuf: Math.round(dto.amountHuf),
          },
        });
      }

      return {
        id: payment.id,
        studioId: payment.studioId,
        guestId: payment.guestId,
        guestName: `${payment.guest.lastName} ${payment.guest.firstName}`,
        guestPassId: payment.guestPassId,
        passName: payment.guestPass?.passTemplate?.name ?? null,
        membershipDueId: dto.membershipDueId ?? null,
        membershipPeriod,
        recordedByUserId: payment.recordedByUserId,
        recordedByName: payment.recordedBy.name,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod as unknown as PaymentMethod,
        isCancelled: payment.isCancelled,
        note: payment.note,
        createdAt: payment.createdAt.toISOString(),
      };
    });
  }

  async cancelPayment(
    paymentId: string,
    reason?: string,
    studioId = DEFAULT_STUDIO_ID,
    staffUserId?: string,
  ): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, studioId },
        include: {
          guest: true,
          guestPass: { include: { passTemplate: true } },
          recordedBy: true,
          allocations: true,
        },
      });

      if (!payment) {
        throw appError('PAYMENT.NOT_FOUND');
      }

      if (payment.isCancelled) {
        throw appError('PAYMENT.ALREADY_CANCELLED');
      }

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          isCancelled: true,
          note: `${payment.note ?? ''} [SZTORNÓZVA${reason ? `: ${reason}` : ''}]`.trim(),
        },
        include: {
          guest: true,
          guestPass: { include: { passTemplate: true } },
          recordedBy: true,
        },
      });

      if (payment.guestPassId) {
        await tx.guestPass.update({
          where: { id: payment.guestPassId },
          data: { isActive: false },
        });

        await tx.passUsageLog.create({
          data: {
            guestPassId: payment.guestPassId,
            guestId: payment.guestId,
            delta: 0,
            note: `Fizetés és bérlet sztornózva${reason ? `: ${reason}` : ''}`,
          },
        });
      }

      // Ha havi tagdíjhoz volt rendelve, visszavonjuk a befizetett összeget az esedékességről
      for (const alloc of payment.allocations ?? []) {
        if (alloc.membershipDueId) {
          const due = await tx.membershipDue.findUnique({
            where: { id: alloc.membershipDueId },
          });
          if (due) {
            const revertedPaid = Math.max(0, due.paidAmountHuf - alloc.amountHuf);
            await tx.membershipDue.update({
              where: { id: due.id },
              data: {
                paidAmountHuf: revertedPaid,
                status:
                  revertedPaid === 0
                    ? MembershipDueStatus.PENDING
                    : revertedPaid < due.amountHuf
                      ? MembershipDueStatus.PARTIAL
                      : MembershipDueStatus.PAID,
              },
            });
          }
        }
      }

      if (staffUserId) {
        await tx.auditLog
          .create({
            data: {
              studioId,
              userId: staffUserId,
              action: 'PAYMENT_CANCELLED',
              entityType: 'Payment',
              entityId: payment.id,
              details: `Fizetés sztornózva (${Number(payment.amount)} Ft): ${reason ?? 'Recepciós korrekció'}`,
            },
          })
          .catch(() => null);
      }

      return {
        id: updatedPayment.id,
        studioId: updatedPayment.studioId,
        guestId: updatedPayment.guestId,
        guestName: `${updatedPayment.guest.lastName} ${updatedPayment.guest.firstName}`,
        guestPassId: updatedPayment.guestPassId,
        passName: updatedPayment.guestPass?.passTemplate?.name ?? null,
        recordedByUserId: updatedPayment.recordedByUserId,
        recordedByName: updatedPayment.recordedBy.name,
        amount: Number(updatedPayment.amount),
        paymentMethod: updatedPayment.paymentMethod as unknown as PaymentMethod,
        isCancelled: updatedPayment.isCancelled,
        note: updatedPayment.note,
        createdAt: updatedPayment.createdAt.toISOString(),
      };
    });
  }

  async createMembership(
    dto: {
      guestId: string;
      monthlyFeeHuf: number;
      startDate?: string;
      dueDay?: number;
    },
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<MembershipDto> {
    const start = dto.startDate ? new Date(dto.startDate) : new Date();
    const dueDay = dto.dueDay ?? 10;
    const schedule = getMembershipDueSchedule(
      { startDate: start, dueDay, status: MembershipStatus.ACTIVE },
      new Date(),
    );

    // Egyetlen nested create: a tagság és az esedékes hónapok atomikusan jönnek létre.
    const created = await this.prisma.membership.create({
      data: {
        studioId,
        guestId: dto.guestId,
        monthlyFeeHuf: dto.monthlyFeeHuf,
        startDate: start,
        dueDay,
        status: 'ACTIVE',
        dues: {
          create: schedule.map(({ period, dueDate }) => ({
            period,
            dueDate,
            amountHuf: dto.monthlyFeeHuf,
            paidAmountHuf: 0,
            status: MembershipDueStatus.PENDING,
          })),
        },
      },
      include: { dues: true, guest: true },
    });

    return this.mapMembership(created);
  }

  async updateMembershipStatus(
    membershipId: string,
    dto: { status: MembershipStatus; monthlyFeeHuf?: number; dueDay?: number },
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<MembershipDto> {
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { id: membershipId, studioId },
      });
      if (!existing) {
        throw appError('MEMBERSHIP.NOT_FOUND');
      }

      // A váltás előtti állapot szerint esedékes hónapok rögzítése, mert
      // újraaktiválás után a számlázás már csak a `resumedAt`-tól folytatódik.
      await this.fillMissingDues(tx, { id: existing.id }, now);

      const previousStatus = existing.status as MembershipStatus;
      await tx.membership.update({
        where: { id: membershipId },
        data: {
          status: dto.status,
          ...(dto.monthlyFeeHuf !== undefined
            ? { monthlyFeeHuf: dto.monthlyFeeHuf }
            : {}),
          ...(dto.dueDay !== undefined ? { dueDay: dto.dueDay } : {}),
          ...getMembershipStatusTimestamps(
            { ...existing, status: previousStatus },
            dto.status,
            now,
          ),
        },
      });

      // Szünet / megszűnés: a hónap elején előre létrehozott, de a leállás
      // napja után esedékes, érintetlen tagdíj törlése.
      if (stopsBilling(previousStatus, dto.status)) {
        const candidates = await tx.membershipDue.findMany({
          where: { membershipId, allocations: { none: {} } },
          select: { id: true, status: true, paidAmountHuf: true, dueDate: true },
        });
        const ids = candidates
          .filter((d) => isDueRemovableOnStop(d, now))
          .map((d) => d.id);
        if (ids.length > 0) {
          await tx.membershipDue.deleteMany({ where: { id: { in: ids } } });
        }
      }

      return tx.membership.findUniqueOrThrow({
        where: { id: membershipId },
        include: { dues: true, guest: true },
      });
    });

    return this.mapMembership(updated);
  }

  /**
   * Hiányzó havi esedékességek idempotens pótlása a stúdió összes tagságára.
   * Ismételt futásra sem duplikál (`@@unique([membershipId, period])`).
   * @returns a létrehozott esedékességek száma
   */
  async ensureDuesUpTo(
    now: Date = new Date(),
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<number> {
    return this.prisma.$transaction((tx) =>
      this.fillMissingDues(tx, { studioId }, now),
    );
  }

  /**
   * Egy vendég tagságainak esedékesség-pótlása (pl. beléptetés előtt).
   * Ha `tx` meg van adva, a hívó tranzakciójában fut.
   * @returns a létrehozott esedékességek száma
   */
  async ensureDuesForGuest(
    guestId: string,
    now: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (tx) return this.fillMissingDues(tx, { guestId }, now);
    return this.prisma.$transaction((t) =>
      this.fillMissingDues(t, { guestId }, now),
    );
  }

  private async fillMissingDues(
    tx: Prisma.TransactionClient,
    where: Prisma.MembershipWhereInput,
    now: Date,
  ): Promise<number> {
    const memberships = await tx.membership.findMany({
      where,
      include: { dues: { select: { period: true } } },
    });

    const data: Prisma.MembershipDueCreateManyInput[] = [];
    for (const m of memberships) {
      const missing = getMissingDues(
        { ...m, status: m.status as MembershipStatus },
        m.dues.map((d) => d.period),
        now,
      );
      for (const { period, dueDate } of missing) {
        data.push({
          membershipId: m.id,
          period,
          dueDate,
          amountHuf: m.monthlyFeeHuf,
          paidAmountHuf: 0,
          status: MembershipDueStatus.PENDING,
        });
      }
    }
    if (data.length === 0) return 0;

    const { count } = await tx.membershipDue.createMany({
      data,
      skipDuplicates: true,
    });
    return count;
  }

  async addMembershipDue(
    membershipId: string,
    dto: { period: string; dueDate: string; amountHuf: number },
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<MembershipDueDto> {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, studioId },
      include: { guest: true },
    });
    if (!membership) {
      throw appError('MEMBERSHIP.NOT_FOUND');
    }

    const due = await this.prisma.membershipDue.create({
      data: {
        membershipId: membership.id,
        period: dto.period,
        dueDate: new Date(dto.dueDate),
        amountHuf: dto.amountHuf,
        paidAmountHuf: 0,
        status: 'PENDING',
      },
    });

    return this.mapMembershipDue(due, membership.guestId);
  }

  /**
   * Elmaradások / tartozások lekérdezése késési kategóriák szerint (1–5, 6–15, 15 nap felett)
   * GET /api/memberships/overdue
   */
  async getOverdueMemberships(
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<OverdueReportDto> {
    const now = new Date();
    await this.ensureDuesUpTo(now, studioId);
    const memberships = await this.prisma.membership.findMany({
      where: { studioId },
      include: {
        guest: true,
        dues: {
          where: {
            status: { in: ['PENDING', 'PARTIAL'] },
          },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    const items: OverdueSummaryItemDto[] = [];
    const buckets: OverdueReportDto['buckets'] = {
      DAYS_1_5: [],
      DAYS_6_15: [],
      DAYS_OVER_15: [],
    };
    let totalOverdueHuf = 0;

    for (const m of memberships) {
      for (const d of m.dues) {
        const remainingHuf = Math.max(0, d.amountHuf - d.paidAmountHuf);
        if (remainingHuf <= 0) continue;

        const diffDays = getOverdueDays(d.dueDate, now);
        if (diffDays <= 0) continue;

        const bucket = getOverdueBucket(diffDays);
        const item: OverdueSummaryItemDto = {
          dueId: d.id,
          membershipId: m.id,
          guestId: m.guestId,
          guestName: `${m.guest.lastName} ${m.guest.firstName}`,
          guestBarcode: m.guest.barcode,
          guestPhone: m.guest.phone,
          period: d.period,
          dueDate: d.dueDate.toISOString(),
          amountHuf: d.amountHuf,
          paidAmountHuf: d.paidAmountHuf,
          remainingHuf,
          overdueDays: diffDays,
          overdueBucket: bucket,
        };

        items.push(item);
        totalOverdueHuf += remainingHuf;
        if (bucket === OverdueBucket.DAYS_1_5) buckets.DAYS_1_5.push(item);
        else if (bucket === OverdueBucket.DAYS_6_15)
          buckets.DAYS_6_15.push(item);
        else if (bucket === OverdueBucket.DAYS_OVER_15)
          buckets.DAYS_OVER_15.push(item);
      }
    }

    return {
      totalOverdueHuf,
      totalOverdueCount: items.length,
      buckets,
      items,
    };
  }

  /**
   * Napi összesítő (GET /api/dashboard/today)
   * Érkezések, napi/havi bevétel, tartozások (1-5, 6-15, 15+ nap), lejáró bérletek, születés- és névnaposok.
   */
  async getTodayDashboard(
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<TodayDashboardDto> {
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayMmDd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [
      todayCheckIns,
      todayPayments,
      monthPayments,
      overdueReport,
      guests,
      todayPassUsages,
      todaySoldPassesCount,
    ] = await Promise.all([
      this.prisma.loggedCheckIn.findMany({
        where: { studioId, createdAt: { gte: startOfDay }, status: 'SUCCESS' },
      }),
      this.prisma.payment.findMany({
        where: { studioId, createdAt: { gte: startOfDay }, isCancelled: false },
      }),
      this.prisma.payment.findMany({
        where: {
          studioId,
          createdAt: { gte: startOfMonth },
          isCancelled: false,
        },
      }),
      this.getOverdueMemberships(studioId),
      this.prisma.guest.findMany({
        where: { studioId, isActive: true },
        include: {
          passes: {
            where: { isActive: true },
            include: { passTemplate: true },
          },
        },
      }),
      this.prisma.passUsageLog.findMany({
        where: {
          usedAt: { gte: startOfDay },
          delta: { lt: 0 },
          reversedAt: null,
        },
        include: { service: true, guestPass: { include: { passTemplate: true } } },
      }),
      this.prisma.guestPass.count({
        where: { studioId, createdAt: { gte: startOfDay } },
      }),
    ]);

    const todayRevenueHuf = todayPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const monthlyRevenueHuf = monthPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    const expiringPasses: TodayDashboardDto['expiringPasses'] = [];
    const celebrants: TodayDashboardDto['celebrants'] = [];

    for (const g of guests) {
      const guestName = `${g.lastName} ${g.firstName}`;
      const isBirthday =
        g.birthDate && g.birthDate.toISOString().slice(5, 10) === todayMmDd;
      const isNameday = g.nameDay === todayMmDd;

      if (isBirthday || isNameday) {
        celebrants.push({
          guestId: g.id,
          guestName,
          barcode: g.barcode,
          type:
            isBirthday && isNameday
              ? 'BOTH'
              : isBirthday
                ? 'BIRTHDAY'
                : 'NAMEDAY',
          detail:
            isBirthday && isNameday
              ? 'Születésnap & Névnap!'
              : isBirthday
                ? 'Ma van a születésnapja!'
                : `Ma ünnepli a névnapját (${g.nameDay})!`,
        });
      }

      for (const p of g.passes ?? []) {
        if (p.isFrozen) continue;
        const daysLeft = Math.ceil(
          (p.expirationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        );
        const lowOccasions =
          p.type === 'OCCASION_BASED' &&
          p.remainingPasses !== null &&
          p.remainingPasses <= 2;

        if (
          (daysLeft >= 0 && daysLeft <= EXPIRING_SOON_THRESHOLD_DAYS + 4) ||
          lowOccasions
        ) {
          expiringPasses.push({
            passId: p.id,
            guestId: g.id,
            guestName,
            passName: p.passTemplate.name,
            remainingPasses: p.remainingPasses,
            expirationDate: p.expirationDate.toISOString(),
            daysLeft,
          });
        }
      }
    }

    const serviceMap = new Map<string, number>();
    for (const u of todayPassUsages) {
      const sName =
        u.service?.name ?? u.guestPass?.passTemplate?.name ?? 'Kezelés';
      serviceMap.set(sName, (serviceMap.get(sName) ?? 0) + 1);
    }

    return {
      date: startOfDay.toISOString().slice(0, 10),
      arrivalsCount: todayCheckIns.length,
      circuitArrivalsCount: todayCheckIns.filter(
        (c) => c.visitType === 'CIRCUIT_TRAINING',
      ).length,
      treatmentsUsedCount: todayPassUsages.length,
      passesSoldTodayCount: todaySoldPassesCount,
      todayRevenueHuf,
      monthlyRevenueHuf,
      overdueTotalHuf: overdueReport.totalOverdueHuf,
      overdueCount: overdueReport.totalOverdueCount,
      overdueByBucket: {
        DAYS_1_5: overdueReport.buckets.DAYS_1_5.length,
        DAYS_6_15: overdueReport.buckets.DAYS_6_15.length,
        DAYS_OVER_15: overdueReport.buckets.DAYS_OVER_15.length,
      },
      expiringPasses,
      celebrants,
      serviceBreakdown: Array.from(serviceMap.entries()).map(
        ([serviceName, usageCount]) => ({ serviceName, usageCount }),
      ),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapMembershipDue(d: any, guestId: string): MembershipDueDto {
    const now = new Date();
    const remainingHuf = Math.max(0, d.amountHuf - d.paidAmountHuf);
    const overdueDays = remainingHuf > 0 ? getOverdueDays(d.dueDate, now) : 0;
    return {
      id: d.id,
      membershipId: d.membershipId,
      guestId,
      period: d.period,
      dueDate: d.dueDate.toISOString(),
      amountHuf: d.amountHuf,
      paidAmountHuf: d.paidAmountHuf,
      remainingHuf,
      status: d.status as MembershipDueStatus,
      overdueDays,
      overdueBucket: getOverdueBucket(overdueDays),
      createdAt: d.createdAt.toISOString(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapMembership(m: any): MembershipDto {
    return {
      id: m.id,
      studioId: m.studioId,
      guestId: m.guestId,
      guestName: m.guest ? `${m.guest.lastName} ${m.guest.firstName}` : undefined,
      monthlyFeeHuf: m.monthlyFeeHuf,
      startDate: m.startDate.toISOString(),
      dueDay: m.dueDay,
      status: m.status as MembershipStatus,
      pausedAt: m.pausedAt ? m.pausedAt.toISOString() : null,
      terminatedAt: m.terminatedAt ? m.terminatedAt.toISOString() : null,
      resumedAt: m.resumedAt ? m.resumedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      dues: (m.dues ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d: any) => this.mapMembershipDue(d, m.guestId),
      ),
    };
  }
}
