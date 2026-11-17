import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  appError,
  AuthUserDto,
  automationDays,
  automationDedupeKey,
  birthMonthDay,
  CalendarDay,
  EmailAutomationDto,
  EmailAutomationKind,
  emailCategoryFor,
  isAnniversaryOn,
  parseNameDay,
  placeholderValuesFor,
  UpdateEmailAutomationDto,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEmail } from './mail-content';
import { MailOutboxService, OutboxItem } from './mail-outbox.service';

const AUTOMATION_ORDER: EmailAutomationKind[] = [
  EmailAutomationKind.WELCOME,
  EmailAutomationKind.BIRTHDAY,
  EmailAutomationKind.NAME_DAY,
];

const AUTOMATION_LABELS: Record<EmailAutomationKind, string> = {
  WELCOME: 'Üdvözlő levél',
  BIRTHDAY: 'Születésnapi levél',
  NAME_DAY: 'Névnapi levél',
};

const AUTOMATION_INCLUDE = {
  template: { select: { id: true, name: true, subject: true, bodyHtml: true } },
} satisfies Prisma.EmailAutomationInclude;

type AutomationRow = Prisma.EmailAutomationGetPayload<{ include: typeof AUTOMATION_INCLUDE }>;

function toAutomationDto(row: AutomationRow): EmailAutomationDto {
  const kind = row.kind as EmailAutomationKind;
  return {
    kind,
    enabled: row.enabled,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    category: emailCategoryFor(kind),
    enabledAt: row.enabledAt ? row.enabledAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface NewGuestForWelcome {
  id: string;
  studioId: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

/**
 * Automatikus levelek (TICKET-55): üdvözlő (új vendég felvételekor, tranzakciós), születés- és
 * névnapi (marketing, csak hozzájárulással). Mindegyik külön kapcsolható, sablon nélkül nem
 * kapcsolható be. A dupla küldést a `message_logs.dedupe_key` egyedisége zárja ki
 * (vendég + automatizmus, a köszöntőknél + év), így a napi futás bármikor megismételhető.
 */
@Injectable()
export class EmailAutomationsService {
  private readonly logger = new Logger(EmailAutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: MailOutboxService,
  ) {}

  /** A hiányzó sorok pótlása (a migráció csak az alapstúdiónak hozza létre). */
  private async ensureRows(studioId: string): Promise<void> {
    await this.prisma.emailAutomation.createMany({
      data: AUTOMATION_ORDER.map((kind) => ({ studioId, kind })),
      skipDuplicates: true,
    });
  }

  async list(studioId: string): Promise<EmailAutomationDto[]> {
    await this.ensureRows(studioId);
    const rows = await this.prisma.emailAutomation.findMany({
      where: { studioId },
      include: AUTOMATION_INCLUDE,
    });
    return AUTOMATION_ORDER.flatMap((kind) => {
      const row = rows.find((r) => r.kind === kind);
      return row ? [toAutomationDto(row)] : [];
    });
  }

  async update(
    kind: EmailAutomationKind,
    dto: UpdateEmailAutomationDto,
    user: AuthUserDto,
    now: Date = new Date(),
  ): Promise<EmailAutomationDto> {
    await this.ensureRows(user.studioId);
    const where = { studioId_kind: { studioId: user.studioId, kind } };
    const current = await this.prisma.emailAutomation.findUniqueOrThrow({ where });

    const templateId = dto.templateId === undefined ? current.templateId : dto.templateId;
    if (templateId) {
      const template = await this.prisma.emailTemplate.findFirst({
        where: { id: templateId, studioId: user.studioId },
        select: { id: true },
      });
      if (!template) throw appError('MAIL.TEMPLATE_NOT_FOUND');
    }
    const enabled = dto.enabled ?? current.enabled;
    if (enabled && !templateId) throw appError('MAIL.AUTOMATION_TEMPLATE_REQUIRED');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.emailAutomation.update({
        where,
        data: {
          enabled,
          templateId,
          // Bekapcsoláskor innen indul a pótlás: a korábbi napokra nem küld utólag.
          ...(enabled && !current.enabled ? { enabledAt: now } : {}),
        },
        include: AUTOMATION_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'EMAIL_AUTOMATION_UPDATED',
          entityType: 'EmailAutomation',
          entityId: row.id,
          details: `${AUTOMATION_LABELS[kind]}: ${enabled ? 'bekapcsolva' : 'kikapcsolva'}, sablon: ${row.template?.name ?? 'nincs'}`,
        },
      });
      return toAutomationDto(row);
    });
  }

  /**
   * Üdvözlő levél az új vendégnek (tranzakciós, hozzájárulás nem kell). Hibánál a vendégfelvétel
   * nem bukik el, csak a napló kapja meg.
   */
  async onGuestCreated(guest: NewGuestForWelcome): Promise<void> {
    if (!guest.email) return;
    try {
      const automation = await this.prisma.emailAutomation.findUnique({
        where: { studioId_kind: { studioId: guest.studioId, kind: EmailAutomationKind.WELCOME } },
        include: AUTOMATION_INCLUDE,
      });
      if (!automation?.enabled || !automation.template) return;
      const queued = await this.outbox.enqueueMany([
        this.itemFor(automation, { ...guest, email: guest.email }, null),
      ]);
      if (queued > 0) this.outbox.kick();
    } catch (err) {
      this.logger.error('Az üdvözlő levél sorba állítása sikertelen', err as Error);
    }
  }

  /**
   * Születés- és névnapi levelek a mai napra (8 órától) és pótlásként az előző napokra, a
   * bekapcsolás napjától (`automationDays`). A sorba került levelek száma.
   */
  async runDaily(now: Date = new Date()): Promise<number> {
    const automations = await this.prisma.emailAutomation.findMany({
      where: {
        enabled: true,
        templateId: { not: null },
        kind: { in: [EmailAutomationKind.BIRTHDAY, EmailAutomationKind.NAME_DAY] },
      },
      include: AUTOMATION_INCLUDE,
    });

    let queued = 0;
    for (const automation of automations) {
      const days = automationDays(now, automation.enabledAt);
      if (days.length === 0 || !automation.template) continue;
      const isBirthday = automation.kind === EmailAutomationKind.BIRTHDAY;

      // Marketing: csak címmel és élő hozzájárulással (a küldéskor újra ellenőrződik).
      const guests = await this.prisma.guest.findMany({
        where: {
          studioId: automation.studioId,
          isActive: true,
          email: { not: null },
          marketingConsent: true,
          unsubscribedAt: null,
          ...(isBirthday ? { birthDate: { not: null } } : { nameDay: { not: null } }),
        },
        select: {
          id: true,
          studioId: true,
          email: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          nameDay: true,
          unsubscribeToken: true,
        },
      });

      const items: OutboxItem[] = [];
      for (const guest of guests) {
        if (!guest.email?.trim()) continue;
        const monthDay = isBirthday ? birthMonthDay(guest.birthDate) : parseNameDay(guest.nameDay);
        for (const day of days) {
          if (!isAnniversaryOn(monthDay, day)) continue;
          items.push(this.itemFor(automation, { ...guest, email: guest.email }, day, guest.unsubscribeToken));
        }
      }
      queued += await this.outbox.enqueueMany(items);
    }
    if (queued > 0) this.outbox.kick();
    return queued;
  }

  private itemFor(
    automation: AutomationRow,
    guest: { id: string; studioId: string; email: string; firstName: string; lastName: string },
    day: CalendarDay | null,
    unsubscribeToken?: string,
  ): OutboxItem {
    const kind = automation.kind as EmailAutomationKind;
    const template = automation.template!;
    const marketing = kind !== EmailAutomationKind.WELCOME;
    return {
      studioId: guest.studioId,
      guestId: guest.id,
      recipientEmail: guest.email,
      recipientName: `${guest.lastName} ${guest.firstName}`.trim(),
      messageType: kind,
      email: buildEmail({
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        values: placeholderValuesFor(guest),
        unsubscribeUrl: marketing && unsubscribeToken ? this.outbox.unsubscribeUrl(unsubscribeToken) : null,
      }),
      templateId: template.id,
      templateName: template.name,
      dedupeKey: automationDedupeKey(kind, guest.id, day ?? undefined),
    };
  }
}
