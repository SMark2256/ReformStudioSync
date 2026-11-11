import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appError } from '@reform/shared';
import type { RenderedEmail } from './templates/login-code';

const SENDPULSE_SMTP_URL = 'https://api.sendpulse.com/smtp/emails';
const SEND_TIMEOUT_MS = 15_000;

export interface MailRecipient {
  email: string;
  name: string;
}

/**
 * Levélküldés a SendPulse SMTP REST API-ján (TICKET-35). A naplóba csak a HTTP státusz
 * kerül, a válasz törzse nem (a címzett adatait tartalmazhatja).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('SENDPULSE_API_KEY') || undefined;
  }

  /** Kulcs nélkül (csak nem production módban lehetséges) nem megy ki levél. */
  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async send(to: MailRecipient, message: RenderedEmail): Promise<void> {
    const apiKey = this.apiKey;
    if (!apiKey) throw appError('AUTH.MAIL_UNAVAILABLE');

    const body = {
      email: {
        subject: message.subject,
        html: Buffer.from(message.html, 'utf8').toString('base64'),
        text: message.text,
        from: {
          name: this.config.get<string>('MAIL_FROM_NAME') || 'ReformStudio Sync',
          email:
            this.config.get<string>('MAIL_FROM_EMAIL') ||
            'devtest@sendpulseemail.com',
        },
        to: [{ email: to.email, name: to.name }],
      },
    };

    let response: Response;
    try {
      response = await fetch(SENDPULSE_SMTP_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'ismeretlen hiba';
      this.logger.error(`SendPulse nem érhető el (${reason})`);
      throw appError('AUTH.MAIL_UNAVAILABLE', { cause: err });
    }

    if (!response.ok) {
      this.logger.error(`SendPulse hiba: HTTP ${response.status}`);
      throw appError('AUTH.MAIL_UNAVAILABLE');
    }
    this.logger.log(`SendPulse: levél elküldve (HTTP ${response.status})`);
  }
}
