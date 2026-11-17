import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'crypto';

/**
 * Google Calendar REST API kliens service accounttal (TICKET-57), függőség nélkül: a JWT-t
 * `node:crypto` RS256-tal írjuk alá, és OAuth tokenre cseréljük. A `googleapis` csomag ehhez
 * a három híváshoz (beszúrás, frissítés, törlés) feleslegesen nagy lenne a Render 512 MB-ján.
 *
 * Env: `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
 * (PEM; a `\n` jelölést sortörésre cseréljük). Ha bármelyik hiányzik, a szinkron ki van kapcsolva.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const REQUEST_TIMEOUT_MS = 15_000;

export interface CalendarEventInput {
  summary: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
}

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GoogleCalendarError';
  }
}

interface ServiceAccount {
  calendarId: string;
  email: string;
  privateKey: string;
}

/** A Google esemény-azonosító (base32hex: 0–9, a–v): a foglalásból determinisztikusan, duplikáció ellen. */
export function calendarEventIdFor(bookingId: string): string {
  return `rs${bookingId.toLowerCase().replace(/[^0-9a-v]/g, '')}`;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

@Injectable()
export class GoogleCalendarClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get account(): ServiceAccount | null {
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID');
    const email = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
    if (!calendarId || !email || !privateKey) return null;
    return { calendarId, email, privateKey: privateKey.replace(/\\n/g, '\n') };
  }

  get isConfigured(): boolean {
    return this.account !== null;
  }

  /** Aláírt service account JWT (RS256), a token-végpontnak. */
  buildAssertion(now: Date = new Date()): string {
    const account = this.requireAccount();
    const iat = Math.floor(now.getTime() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({ iss: account.email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
    );
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(account.privateKey)
      .toString('base64url');
    return `${header}.${claims}.${signature}`;
  }

  private requireAccount(): ServiceAccount {
    const account = this.account;
    if (!account) throw new GoogleCalendarError('A Google Naptár szinkron nincs beállítva.');
    return account;
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }
    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.buildAssertion(),
      }).toString(),
    });
    if (!response.ok) {
      throw new GoogleCalendarError(`Google token hiba (HTTP ${response.status})`, response.status);
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new GoogleCalendarError('A Google token válasza hiányos.');
    this.cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new GoogleCalendarError(`A Google nem érhető el (${(err as Error).name}).`);
    }
  }

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    const token = await this.accessToken();
    return this.fetch(`${CALENDAR_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private eventsPath(eventId?: string): string {
    const calendarId = encodeURIComponent(this.requireAccount().calendarId);
    return `/calendars/${calendarId}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
  }

  /**
   * Létrehozás vagy frissítés ugyanazzal az esemény-azonosítóval: előbb frissítünk, ha nincs
   * ilyen esemény, beszúrjuk. Ismételt (pl. időtúllépés utáni) beszúrás 409-et ad, ilyenkor
   * újra frissítünk, így duplikált esemény nem keletkezik.
   */
  async upsertEvent(eventId: string, event: CalendarEventInput): Promise<void> {
    const resource = {
      id: eventId,
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startsAt.toISOString(), timeZone: 'Europe/Budapest' },
      end: { dateTime: event.endsAt.toISOString(), timeZone: 'Europe/Budapest' },
      status: 'confirmed',
    };
    let response = await this.call('PUT', this.eventsPath(eventId), resource);
    if (response.status === 404) {
      response = await this.call('POST', this.eventsPath(), resource);
      if (response.status === 409) {
        response = await this.call('PUT', this.eventsPath(eventId), resource);
      }
    }
    if (!response.ok) {
      throw new GoogleCalendarError(`Google Naptár hiba (HTTP ${response.status})`, response.status);
    }
  }

  /** Törlés; a már nem létező esemény (404 / 410) nem hiba. */
  async deleteEvent(eventId: string): Promise<void> {
    const response = await this.call('DELETE', this.eventsPath(eventId));
    if (response.ok || response.status === 404 || response.status === 410) return;
    throw new GoogleCalendarError(`Google Naptár hiba (HTTP ${response.status})`, response.status);
  }
}
