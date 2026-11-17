import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  appError,
  AuthUserDto,
  EMAIL_TEMPLATE_NAME_MAX_LENGTH,
  EmailAutomationKind,
  EmailTemplateDto,
  MessageLogDto,
  placeholderValuesFor,
  SaveEmailTemplateDto,
  SendTestEmailDto,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEmail, cleanEmailContent } from './mail-content';
import { MailOutboxService } from './mail-outbox.service';

const TEMPLATE_INCLUDE = {
  updatedBy: { select: { name: true } },
  automations: { select: { kind: true } },
} satisfies Prisma.EmailTemplateInclude;

type TemplateRow = Prisma.EmailTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;

function toTemplateDto(row: TemplateRow): EmailTemplateDto {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy?.name ?? null,
    usedByAutomations: row.automations.map((a) => a.kind as EmailAutomationKind),
  };
}

/** Magyar névsorrend: a keresztnév az utolsó tag („Siklódi Márk” → Márk, Siklódi). */
function splitStaffName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.pop() ?? '';
  return { firstName, lastName: parts.join(' ') };
}

/** E-mail-sablonok (TICKET-55): létrehozás, szerkesztés, törlés, tesztküldés. */
@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: MailOutboxService,
  ) {}

  async list(studioId: string): Promise<EmailTemplateDto[]> {
    const rows = await this.prisma.emailTemplate.findMany({
      where: { studioId },
      include: TEMPLATE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(toTemplateDto);
  }

  /** A sablon a stúdióban, vagy `MAIL.TEMPLATE_NOT_FOUND`. */
  async get(id: string, studioId: string) {
    const row = await this.prisma.emailTemplate.findFirst({ where: { id, studioId } });
    if (!row) throw appError('MAIL.TEMPLATE_NOT_FOUND');
    return row;
  }

  private clean(dto: SaveEmailTemplateDto) {
    const name = dto.name.replace(/\s+/g, ' ').trim().slice(0, EMAIL_TEMPLATE_NAME_MAX_LENGTH);
    if (!name) throw appError('COMMON.VALIDATION_FAILED', { message: 'A sablon neve kötelező.' });
    return { name, ...cleanEmailContent(dto) };
  }

  async create(dto: SaveEmailTemplateDto, user: AuthUserDto): Promise<EmailTemplateDto> {
    const data = this.clean(dto);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.emailTemplate.create({
        data: { ...data, studioId: user.studioId, updatedById: user.id },
        include: TEMPLATE_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'EMAIL_TEMPLATE_CREATED',
          entityType: 'EmailTemplate',
          entityId: row.id,
          details: `Sablon létrehozva: ${row.name}`,
        },
      });
      return toTemplateDto(row);
    });
  }

  async update(id: string, dto: SaveEmailTemplateDto, user: AuthUserDto): Promise<EmailTemplateDto> {
    await this.get(id, user.studioId);
    const data = this.clean(dto);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.emailTemplate.update({
        where: { id },
        data: { ...data, updatedById: user.id },
        include: TEMPLATE_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'EMAIL_TEMPLATE_UPDATED',
          entityType: 'EmailTemplate',
          entityId: row.id,
          details: `Sablon módosítva: ${row.name}`,
        },
      });
      return toTemplateDto(row);
    });
  }

  /**
   * Törlés: a már elküldött levelek naplója megmarad (a sablon neve a sorban), a sablont használó
   * automatikus levél kikapcsol, és „nincs beállítva” állapotba kerül.
   */
  async remove(id: string, user: AuthUserDto): Promise<{ deletedId: string }> {
    const existing = await this.get(id, user.studioId);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailAutomation.updateMany({
        where: { studioId: user.studioId, templateId: id },
        data: { enabled: false, templateId: null },
      });
      await tx.emailTemplate.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'EMAIL_TEMPLATE_DELETED',
          entityType: 'EmailTemplate',
          entityId: id,
          details: `Sablon törölve: ${existing.name}`,
        },
      });
    });
    return { deletedId: id };
  }

  /** Tesztlevél a bejelentkezett munkatárs címére, a mezőkben a munkatárs nevével. */
  async sendTest(dto: SendTestEmailDto, user: AuthUserDto): Promise<MessageLogDto> {
    const content = cleanEmailContent(dto);
    const email = buildEmail({
      subject: `[Teszt] ${content.subject}`,
      bodyHtml: content.bodyHtml,
      values: placeholderValuesFor(splitStaffName(user.name)),
    });
    const message = await this.outbox.enqueue({
      studioId: user.studioId,
      guestId: null,
      recipientEmail: user.email,
      recipientName: user.name,
      messageType: 'TEST',
      email,
      createdById: user.id,
    });
    this.outbox.kick();
    return message;
  }
}
