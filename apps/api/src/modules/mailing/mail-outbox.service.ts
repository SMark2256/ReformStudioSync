import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageLog, Prisma } from '@prisma/client';
import {
  appError,
  DEFAULT_MAIL_HOURLY_LIMIT,
  EMAIL_MAX_ATTEMPTS,
  EmailCategory,
  emailCategoryFor,
  EmailMessageListDto,
  EmailMessageListQueryDto,
  EmailMessageType,
  emailRetryDelayMs,
  isAppError,
  MailStatusDto,
  marketingExclusion,
  MessageLogDto,
  MessageStatus,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { RenderedEmail } from '../mail/templates/login-code';

const HOUR_MS = 60 * 60 * 1000;
const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

/** Egy levél a sorba (a tartalom már kész: kitöltött mezők, keret, szöveges változat). */
export interface OutboxItem {
  studioId: string;
  guestId: string | null;
  recipientEmail: string;
  recipientName: string | null;
  messageType: EmailMessageType;
  email: RenderedEmail;
  templateId?: string | null;
  templateName?: string | null;
  batchId?: string | null;
  /** Dupla küldés kizárása (egyedi); ugyanazzal a kulccsal a második sor nem jön létre. */
  dedupeKey?: string | null;
  createdById?: string | null;
}

export const MESSAGE_INCLUDE = {
  guest: { select: { firstName: true, lastName: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.MessageLogInclude;

type MessageRow = Prisma.MessageLogGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export function toMessageLogDto(row: MessageRow): MessageLogDto {
  return {
    id: row.id,
    guestId: row.guestId,
    guestName: row.guest ? `${row.guest.lastName} ${row.guest.firstName}` : undefined,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    subject: row.subject,
    messageType: row.messageType,
    category: row.category as EmailCategory,
    status: row.status as MessageStatus,
    templateId: row.templateId,
    templateName: row.templateName,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    nextAttemptAt:
      row.status === MessageStatus.PENDING ? row.nextAttemptAt.toISOString() : null,
    errorDetails: row.errorDetails,
    createdByName: row.createdBy?.name ?? null,
  };
}

function toCreateData(item: OutboxItem): Prisma.MessageLogCreateManyInput {
  return {
    studioId: item.studioId,
    guestId: item.guestId,
    recipientEmail: item.recipientEmail,
    recipientName: item.recipientName,
    subject: item.email.subject,
    html: item.email.html,
    text: item.email.text,
    messageType: item.messageType,
    category: emailCategoryFor(item.messageType),
    status: MessageStatus.PENDING,
    templateId: item.templateId ?? null,
    templateName: item.templateName ?? null,
    batchId: item.batchId ?? null,
    dedupeKey: item.dedupeKey ?? null,
    createdById: item.createdById ?? null,
  };
}

function describeSendError(err: unknown): string {
  if (isAppError(err) && err.code === 'AUTH.MAIL_UNAVAILABLE') {
    return 'A levélküldő szolgáltatás (SendPulse) nem érhető el, vagy nem fogadta a levelet.';
  }
  return err instanceof Error && err.message ? err.message : 'Ismeretlen hiba a küldéskor.';
}

const budapestTime = new Intl.DateTimeFormat('hu-HU', {
  timeZone: 'Europe/Budapest',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Kimenő sor (TICKET-55): minden vendéglevél és tesztlevél a `message_logs` táblába kerül, és
 * innen megy ki az óránkénti korláttal (`MAIL_HOURLY_LIMIT`). Hibánál visszalépő újrapróbálás
 * (`emailRetryDelayMs`), `EMAIL_MAX_ATTEMPTS` után végleg hibás. A sor állapota az adatbázisban
 * él, így újraindítás után ott folytatódik, ahol abbamaradt.
 */
@Injectable()
export class MailOutboxService {
  private readonly logger = new Logger(MailOutboxService.name);
  private inFlight: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  get hourlyLimit(): number {
    const limit = Number(this.config.get('MAIL_HOURLY_LIMIT'));
    return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_MAIL_HOURLY_LIMIT;
  }

  /** A vendég nyilvános leiratkozó oldala (a webappon, belépés nélkül). */
  unsubscribeUrl(token: string): string {
    const base = (this.config.get<string>('PUBLIC_WEB_URL') || 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    return `${base}/leiratkozas/${encodeURIComponent(token)}`;
  }

  async enqueue(item: OutboxItem): Promise<MessageLogDto> {
    const row = await this.prisma.messageLog.create({
      data: toCreateData(item),
      include: MESSAGE_INCLUDE,
    });
    return toMessageLogDto(row);
  }

  /** Kötegelt felvétel; a már létező `dedupeKey`-jű sor kimarad. A létrejött sorok száma. */
  async enqueueMany(items: OutboxItem[]): Promise<number> {
    if (items.length === 0) return 0;
    const { count } = await this.prisma.messageLog.createMany({
      data: items.map(toCreateData),
      skipDuplicates: true,
    });
    return count;
  }

  /** Azonnali küldés indítása (pl. új levél után), a hívót nem várakoztatja. */
  kick(): void {
    void this.processDue().catch((err: unknown) =>
      this.logger.error('A kimenő sor feldolgozása sikertelen', err as Error),
    );
  }

  /**
   * Az esedékes levelek küldése a korláton belül. Egyszerre egy futás van; a párhuzamos hívás a
   * folyamatban lévőt kapja vissza. Az elküldött levelek száma.
   */
  processDue(now: Date = new Date()): Promise<number> {
    if (!this.inFlight) {
      this.inFlight = this.runBatch(now).finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async runBatch(now: Date): Promise<number> {
    // Kulcs nélkül (csak fejlesztői módban) a levelek a sorban várnak, a felület jelzi.
    if (!this.mail.isConfigured) return 0;

    const sentLastHour = await this.countSentSince(new Date(now.getTime() - HOUR_MS));
    const budget = this.hourlyLimit - sentLastHour;
    if (budget <= 0) return 0;

    const due = await this.prisma.messageLog.findMany({
      where: { status: MessageStatus.PENDING, nextAttemptAt: { lte: now } },
      // A tranzakciós (üdvözlő, egyéni, teszt) levél előzi a marketinget.
      orderBy: [{ category: 'asc' }, { nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: budget,
    });

    let sent = 0;
    for (const row of due) {
      if (await this.sendOne(row, now)) sent += 1;
    }
    if (sent > 0) this.logger.log(`Kimenő sor: ${sent} levél elküldve`);
    return sent;
  }

  private async sendOne(row: MessageLog, now: Date): Promise<boolean> {
    const attempt = row.attempts + 1;
    // Feltételes foglalás: ha közben más futás már próbálta, ez kimarad (nem megy ki kétszer).
    const claim = await this.prisma.messageLog.updateMany({
      where: { id: row.id, status: MessageStatus.PENDING, attempts: row.attempts },
      data: {
        attempts: attempt,
        lastAttemptAt: now,
        nextAttemptAt: new Date(now.getTime() + emailRetryDelayMs(attempt)),
      },
    });
    if (claim.count !== 1) return false;

    // Marketing levél: a hozzájárulás a küldés pillanatában is kell (közben leiratkozhatott).
    if (row.category === EmailCategory.MARKETING) {
      const guest = row.guestId
        ? await this.prisma.guest.findUnique({
            where: { id: row.guestId },
            select: { email: true, marketingConsent: true, unsubscribedAt: true },
          })
        : null;
      if (!guest || marketingExclusion(guest) !== null) {
        await this.prisma.messageLog.update({
          where: { id: row.id },
          data: {
            status: MessageStatus.FAILED,
            errorDetails:
              'A vendég nem járult hozzá a marketing levelekhez (vagy leiratkozott); a levél nem ment ki.',
          },
        });
        return false;
      }
    }

    try {
      await this.mail.send(
        { email: row.recipientEmail, name: row.recipientName ?? '' },
        { subject: row.subject, html: row.html ?? '', text: row.text ?? '' },
      );
    } catch (err) {
      const reason = describeSendError(err);
      const final = attempt >= EMAIL_MAX_ATTEMPTS;
      const retryAt = budapestTime.format(new Date(now.getTime() + emailRetryDelayMs(attempt)));
      await this.prisma.messageLog.update({
        where: { id: row.id },
        data: {
          status: final ? MessageStatus.FAILED : MessageStatus.PENDING,
          errorDetails: final
            ? `${reason} (${attempt} próbálkozás után)`
            : `${reason} Újrapróbálás ${retryAt}-kor (${attempt}/${EMAIL_MAX_ATTEMPTS}).`,
        },
      });
      return false;
    }

    await this.prisma.messageLog.update({
      where: { id: row.id },
      data: { status: MessageStatus.SENT, sentAt: new Date(), errorDetails: null },
    });
    return true;
  }

  private countSentSince(since: Date): Promise<number> {
    // A korlát a SendPulse fiókra szól, ezért minden stúdió leveleit számolja.
    return this.prisma.messageLog.count({
      where: { status: MessageStatus.SENT, sentAt: { gte: since } },
    });
  }

  /** Hibás levél újra a sorba (a próbálkozások elölről). */
  async retry(id: string, studioId: string): Promise<MessageLogDto> {
    const existing = await this.prisma.messageLog.findFirst({ where: { id, studioId } });
    if (!existing) throw appError('MAIL.MESSAGE_NOT_FOUND');
    if (existing.status !== MessageStatus.FAILED || !existing.html) {
      throw appError('MAIL.NOT_RETRYABLE');
    }
    const row = await this.prisma.messageLog.update({
      where: { id },
      data: {
        status: MessageStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        errorDetails: null,
      },
      include: MESSAGE_INCLUDE,
    });
    this.kick();
    return toMessageLogDto(row);
  }

  async list(studioId: string, query: EmailMessageListQueryDto): Promise<EmailMessageListDto> {
    const q = query.q?.trim();
    const where: Prisma.MessageLogWhereInput = {
      studioId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.messageType ? { messageType: query.messageType } : {}),
      ...(q
        ? {
            OR: [
              { recipientEmail: { contains: q, mode: 'insensitive' } },
              { recipientName: { contains: q, mode: 'insensitive' } },
              { subject: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const limit = Math.min(Math.max(1, query.limit ?? LIST_DEFAULT_LIMIT), LIST_MAX_LIMIT);
    const [rows, total] = await Promise.all([
      this.prisma.messageLog.findMany({
        where,
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: Math.max(0, query.offset ?? 0),
      }),
      this.prisma.messageLog.count({ where }),
    ]);
    return { items: rows.map(toMessageLogDto), total };
  }

  async listForGuest(guestId: string, studioId: string): Promise<MessageLogDto[]> {
    const rows = await this.prisma.messageLog.findMany({
      where: { guestId, studioId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: LIST_DEFAULT_LIMIT,
    });
    return rows.map(toMessageLogDto);
  }

  async status(studioId: string, now: Date = new Date()): Promise<MailStatusDto> {
    const [sentLastHour, pendingCount, failedCount] = await Promise.all([
      this.countSentSince(new Date(now.getTime() - HOUR_MS)),
      this.prisma.messageLog.count({ where: { studioId, status: MessageStatus.PENDING } }),
      this.prisma.messageLog.count({ where: { studioId, status: MessageStatus.FAILED } }),
    ]);
    return {
      configured: this.mail.isConfigured,
      hourlyLimit: this.hourlyLimit,
      sentLastHour,
      pendingCount,
      failedCount,
    };
  }
}
