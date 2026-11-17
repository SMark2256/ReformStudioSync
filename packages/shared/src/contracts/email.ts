import {
  AudienceExclusion,
  EmailAudienceFilter,
  EmailAutomationKind,
  EmailCategory,
} from '../email';
import { MessageStatus } from '../enums';
import type { MessageLogDto } from './index';

// Vendégkommunikáció (TICKET-55): sablonok, automatikus levelek, csoportos és egyéni küldés, napló.

export interface EmailTemplateDto {
  id: string;
  name: string;
  subject: string;
  /** Szanitizált HTML törzs, `{{mezo}}` helyőrzőkkel. */
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
  /** Ezek az automatikus levelek használják (törléskor „nincs beállítva” állapotba kerülnek). */
  usedByAutomations: EmailAutomationKind[];
}

export interface SaveEmailTemplateDto {
  name: string;
  subject: string;
  bodyHtml: string;
}

/** Tesztlevél a bejelentkezett munkatárs címére, a mezőkben a munkatárs nevével. */
export interface SendTestEmailDto {
  subject: string;
  bodyHtml: string;
}

export interface EmailAutomationDto {
  kind: EmailAutomationKind;
  enabled: boolean;
  templateId: string | null;
  templateName: string | null;
  category: EmailCategory;
  /** Az utolsó bekapcsolás ideje: a pótlás ennél korábbi napra nem küld. */
  enabledAt: string | null;
  updatedAt: string;
}

export interface UpdateEmailAutomationDto {
  enabled?: boolean;
  templateId?: string | null;
}

export type EmailAudienceFilterDto = EmailAudienceFilter;

export interface EmailAudienceRecipientDto {
  guestId: string;
  name: string;
  email: string;
}

export interface EmailAudiencePreviewDto {
  /** A szűrőnek megfelelő aktív vendégek. */
  matched: number;
  /** Ennyien kapják meg (címük és hozzájárulásuk van). */
  total: number;
  recipients: EmailAudienceRecipientDto[];
  excluded: Record<AudienceExclusion, number>;
}

export interface SendBulkEmailDto {
  filter: EmailAudienceFilterDto;
  /** Az előnézetben jóváhagyott címzettek; a küldéskor a hozzájárulás újra ellenőrződik. */
  guestIds: string[];
  subject: string;
  bodyHtml: string;
  templateId?: string | null;
}

export interface SendBulkEmailResultDto {
  batchId: string;
  queued: number;
  /** Időközben kiesett (pl. leiratkozott) vagy a szűrőnek már nem megfelelő címzettek. */
  skipped: number;
}

/** Egyéni levél a vendégadatlapról (egyedi szöveg vagy sablon alapján). */
export interface SendGuestEmailDto {
  subject: string;
  bodyHtml: string;
  templateId?: string | null;
}

export interface EmailMessageListQueryDto {
  status?: MessageStatus;
  messageType?: string;
  /** Címzett neve, címe vagy a tárgy. */
  q?: string;
  limit?: number;
  offset?: number;
}

export interface EmailMessageListDto {
  items: MessageLogDto[];
  total: number;
}

export interface MailStatusDto {
  /** Van-e levélküldő (SendPulse kulcs); nélküle a levelek a sorban várakoznak. */
  configured: boolean;
  hourlyLimit: number;
  sentLastHour: number;
  pendingCount: number;
  failedCount: number;
}

/** A nyilvános leiratkozó oldal adatai (`/leiratkozas/:token`); csak a keresztnév látszik. */
export interface UnsubscribeInfoDto {
  firstName: string;
  unsubscribed: boolean;
  studioName: string;
}
