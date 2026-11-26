import { Injectable } from '@nestjs/common';
import {
  appError,
  AudienceEntitlement,
  AuthUserDto,
  computeRemainingPasses,
  EMAIL_BULK_MAX_RECIPIENTS,
  EmailAudienceFilterDto,
  EmailAudiencePreviewDto,
  EmailAudienceRecipientDto,
  getPassStatus,
  marketingExclusion,
  matchesAudienceFilter,
  MembershipStatus,
  MessageLogDto,
  PassStatus,
  placeholderValuesFor,
  SendBulkEmailDto,
  SendBulkEmailResultDto,
  SendGuestEmailDto,
} from '@reform/shared';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEmail, cleanEmailContent } from './mail-content';
import { MailOutboxService } from './mail-outbox.service';

/** Az érvényes bérlet: aktív, vagy megvett, de még nem kezdődött. */
const CURRENT_PASS_STATUSES = new Set<PassStatus>([PassStatus.ACTIVE, PassStatus.NOT_STARTED]);

interface EligibleGuest extends EmailAudienceRecipientDto {
  unsubscribeToken: string;
  firstName: string;
  lastName: string;
}

/** Csoportos (marketing) és egyéni (vendégadatlap) küldés (TICKET-55). */
@Injectable()
export class EmailCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: MailOutboxService,
  ) {}

  /**
   * A szűrőnek megfelelő aktív vendégek, és közülük azok, akik megkaphatják a marketing levelet
   * (van címük, hozzájárultak, nem iratkoztak le).
   */
  private async resolveAudience(studioId: string, filter: EmailAudienceFilterDto, now: Date) {
    const guests = await this.prisma.guest.findMany({
      where: { studioId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        marketingConsent: true,
        unsubscribedAt: true,
        unsubscribeToken: true,
        passes: {
          where: { cancelledAt: null },
          select: {
            type: true,
            totalPasses: true,
            startDate: true,
            expirationDate: true,
            validUntil: true,
            isFrozen: true,
            cancelledAt: true,
            serviceId: true,
            passTemplate: { select: { serviceId: true } },
            usageLogs: { select: { delta: true, reversedAt: true } },
          },
        },
        memberships: { select: { serviceId: true, status: true } },
        visits: { select: { checkedInAt: true }, orderBy: { checkedInAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const excluded = { NO_EMAIL: 0, NO_CONSENT: 0 };
    const eligible: EligibleGuest[] = [];
    let matched = 0;
    for (const guest of guests) {
      const entitlements: AudienceEntitlement[] = [
        ...guest.passes.map((pass) => ({
          serviceId: pass.serviceId ?? pass.passTemplate?.serviceId ?? null,
          current: CURRENT_PASS_STATUSES.has(
            getPassStatus(
              { ...pass, remainingPasses: computeRemainingPasses(pass.totalPasses, pass.usageLogs) },
              now,
            ),
          ),
        })),
        ...guest.memberships.map((m) => ({
          serviceId: m.serviceId,
          current: m.status === MembershipStatus.ACTIVE,
        })),
      ];
      const candidate = { entitlements, lastVisitAt: guest.visits[0]?.checkedInAt ?? null };
      if (!matchesAudienceFilter(candidate, filter, now)) continue;
      matched += 1;

      const exclusion = marketingExclusion(guest);
      if (exclusion) {
        excluded[exclusion] += 1;
        continue;
      }
      eligible.push({
        guestId: guest.id,
        name: `${guest.lastName} ${guest.firstName}`,
        email: guest.email!.trim(),
        unsubscribeToken: guest.unsubscribeToken,
        firstName: guest.firstName,
        lastName: guest.lastName,
      });
    }
    return { matched, excluded, eligible };
  }

  async previewAudience(
    studioId: string,
    filter: EmailAudienceFilterDto,
    now: Date = new Date(),
  ): Promise<EmailAudiencePreviewDto> {
    const { matched, excluded, eligible } = await this.resolveAudience(studioId, filter, now);
    return {
      matched,
      total: eligible.length,
      recipients: eligible.map(({ guestId, name, email }) => ({ guestId, name, email })),
      excluded,
    };
  }

  /**
   * Csoportos küldés: csak a jóváhagyott listán szereplő, a szűrőnek most is megfelelő és
   * hozzájáruló vendégek kapják meg (közben leiratkozott vendég kimarad).
   */
  async sendBulk(
    dto: SendBulkEmailDto,
    user: AuthUserDto,
    now: Date = new Date(),
  ): Promise<SendBulkEmailResultDto> {
    const content = cleanEmailContent(dto);
    const requested = new Set(dto.guestIds);
    if (requested.size > EMAIL_BULK_MAX_RECIPIENTS) throw appError('MAIL.TOO_MANY_RECIPIENTS');

    const { eligible } = await this.resolveAudience(user.studioId, dto.filter, now);
    const recipients = eligible.filter((g) => requested.has(g.guestId));
    if (recipients.length === 0) throw appError('MAIL.NO_RECIPIENTS');

    const template = dto.templateId
      ? await this.prisma.emailTemplate.findFirst({
          where: { id: dto.templateId, studioId: user.studioId },
          select: { id: true, name: true },
        })
      : null;

    const batchId = randomUUID();
    const queued = await this.outbox.enqueueMany(
      recipients.map((guest) => ({
        studioId: user.studioId,
        guestId: guest.guestId,
        recipientEmail: guest.email,
        recipientName: guest.name,
        messageType: 'BULK' as const,
        email: buildEmail({
          ...content,
          values: placeholderValuesFor(guest),
          unsubscribeUrl: this.outbox.unsubscribeUrl(guest.unsubscribeToken),
        }),
        templateId: template?.id ?? null,
        templateName: template?.name ?? null,
        batchId,
        createdById: user.id,
      })),
    );

    await this.prisma.auditLog.create({
      data: {
        studioId: user.studioId,
        userId: user.id,
        action: 'BULK_EMAIL_QUEUED',
        entityType: 'MessageBatch',
        entityId: batchId,
        details: `Csoportos levél sorba állítva: ${queued} címzett, tárgy: ${content.subject}`,
      },
    });
    this.outbox.kick();
    return { batchId, queued, skipped: requested.size - recipients.length };
  }

  /** Egyéni levél a vendégadatlapról (tranzakciós: egy vendégnek, egy munkatárstól). */
  async sendToGuest(
    guestId: string,
    dto: SendGuestEmailDto,
    user: AuthUserDto,
  ): Promise<MessageLogDto> {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, studioId: user.studioId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!guest) throw appError('GUEST.NOT_FOUND');
    const recipientEmail = guest.email?.trim();
    if (!recipientEmail) throw appError('MAIL.GUEST_NO_EMAIL');

    const content = cleanEmailContent(dto);
    const template = dto.templateId
      ? await this.prisma.emailTemplate.findFirst({
          where: { id: dto.templateId, studioId: user.studioId },
          select: { id: true, name: true },
        })
      : null;

    const message = await this.outbox.enqueue({
      studioId: user.studioId,
      guestId: guest.id,
      recipientEmail,
      recipientName: `${guest.lastName} ${guest.firstName}`,
      messageType: 'MANUAL',
      email: buildEmail({ ...content, values: placeholderValuesFor(guest) }),
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      createdById: user.id,
    });
    await this.prisma.auditLog.create({
      data: {
        studioId: user.studioId,
        userId: user.id,
        action: 'GUEST_EMAIL_QUEUED',
        entityType: 'Guest',
        entityId: guest.id,
        details: `Egyéni levél sorba állítva: ${content.subject}`,
      },
    });
    this.outbox.kick();
    return message;
  }
}
