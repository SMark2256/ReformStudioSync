import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyFinanceSummaryDto,
  DEFAULT_STUDIO_ID,
  PaymentDto,
  PaymentMethod,
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

      return {
        id: p.id,
        studioId: p.studioId,
        guestId: p.guestId,
        guestName: `${p.guest.lastName} ${p.guest.firstName}`,
        guestPassId: p.guestPassId,
        passName: p.guestPass?.passTemplate?.name ?? null,
        recordedByUserId: p.recordedByUserId,
        recordedByName: p.recordedBy.name,
        amount,
        paymentMethod: method,
        isCancelled: p.isCancelled,
        note: p.note,
        createdAt: p.createdAt.toISOString(),
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

  async cancelPayment(
    paymentId: string,
    reason?: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, studioId },
        include: {
          guest: true,
          guestPass: { include: { passTemplate: true } },
          recordedBy: true,
        },
      });

      if (!payment) {
        throw new NotFoundException('A fizetési tétel nem található.');
      }

      if (payment.isCancelled) {
        throw new BadRequestException('Ez a fizetési tétel már sztornózva lett.');
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
            delta: 0,
            note: `Fizetés és bérlet sztornózva${reason ? `: ${reason}` : ''}`,
          },
        });
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
}
