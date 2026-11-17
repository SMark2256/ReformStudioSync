import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appError } from '@reform/shared';
import { createHmac, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';

const REQUEST_TIMEOUT_MS = 20_000;
/** A letöltési link alapértelmezett élettartama. */
export const DEFAULT_LINK_TTL_SECONDS = 10 * 60;

export type StorageMode = 'supabase' | 'local' | 'unconfigured';

export interface StoredObjectLink {
  url: string;
  expiresAt: string;
}

/**
 * Fájltárolás (TICKET-56): Supabase Storage REST API, privát bucket, lejáró aláírt letöltési
 * link. Beállítás nélkül nem production módban helyi fájlrendszer (`LOCAL_STORAGE_DIR`, a link
 * az API saját, HMAC-cel aláírt, lejáró útvonala); production módban `STORAGE.NOT_CONFIGURED`
 * hiba, nem összeomlás.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  private get supabaseUrl(): string | undefined {
    return this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '') || undefined;
  }

  private get serviceKey(): string | undefined {
    return this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') || undefined;
  }

  private get bucket(): string {
    return this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'guest-documents';
  }

  private get localRoot(): string {
    return resolve(this.config.get<string>('LOCAL_STORAGE_DIR') || join(process.cwd(), '.local-storage'));
  }

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET') ?? 'reform-studio-dev-secret-change-in-prod';
  }

  get mode(): StorageMode {
    if (this.supabaseUrl && this.serviceKey) return 'supabase';
    return this.config.get<string>('NODE_ENV') === 'production' ? 'unconfigured' : 'local';
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<void> {
    const mode = this.requireMode();
    if (mode === 'local') {
      const path = this.localPath(key);
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, data);
      return;
    }
    const response = await this.supabaseFetch(`/object/${this.bucket}/${encodeKey(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
      body: data,
    });
    if (!response.ok) this.fail('feltöltés', response.status);
  }

  async download(key: string): Promise<Buffer> {
    const mode = this.requireMode();
    if (mode === 'local') {
      try {
        return await fs.readFile(this.localPath(key));
      } catch (err) {
        throw appError('STORAGE.UNAVAILABLE', { cause: err });
      }
    }
    const response = await this.supabaseFetch(`/object/${this.bucket}/${encodeKey(key)}`, {
      method: 'GET',
    });
    if (!response.ok) this.fail('letöltés', response.status);
    return Buffer.from(await response.arrayBuffer());
  }

  /** Lejáró letöltési link. Helyi tárolónál az API relatív útvonala (`/storage/local/...`). */
  async createLink(key: string, ttlSeconds = DEFAULT_LINK_TTL_SECONDS): Promise<StoredObjectLink> {
    const mode = this.requireMode();
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    if (mode === 'local') {
      const token = this.signLocalToken(key, expiresAtMs);
      return { url: `/storage/local/${token}`, expiresAt };
    }
    const response = await this.supabaseFetch(`/object/sign/${this.bucket}/${encodeKey(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    });
    if (!response.ok) this.fail('link', response.status);
    const body = (await response.json()) as { signedURL?: string; signedUrl?: string };
    const signed = body.signedURL ?? body.signedUrl;
    if (!signed) throw appError('STORAGE.UNAVAILABLE');
    return { url: `${this.supabaseUrl}/storage/v1${signed}`, expiresAt };
  }

  /** A helyi link tokenje: `base64url(kulcs).lejárat.HMAC`. Lejárt vagy hamis tokenre hiba. */
  resolveLocalToken(token: string): string {
    const [encodedKey, expiresAt, signature] = token.split('.');
    if (!encodedKey || !expiresAt || !signature) throw appError('STORAGE.LINK_INVALID');
    const key = Buffer.from(encodedKey, 'base64url').toString('utf8');
    const expected = this.hmac(`${key}.${expiresAt}`);
    const valid =
      expected.length === signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid || Number(expiresAt) < Date.now()) throw appError('STORAGE.LINK_INVALID');
    return key;
  }

  private signLocalToken(key: string, expiresAtMs: number): string {
    const encodedKey = Buffer.from(key, 'utf8').toString('base64url');
    return `${encodedKey}.${expiresAtMs}.${this.hmac(`${key}.${expiresAtMs}`)}`;
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  private requireMode(): Exclude<StorageMode, 'unconfigured'> {
    const mode = this.mode;
    if (mode === 'unconfigured') throw appError('STORAGE.NOT_CONFIGURED');
    return mode;
  }

  /** A kulcs nem léphet ki a helyi gyökérből (`..`). */
  private localPath(key: string): string {
    const root = this.localRoot;
    const path = resolve(root, key);
    if (path !== root && !path.startsWith(root + sep)) throw appError('STORAGE.LINK_INVALID');
    return path;
  }

  private async supabaseFetch(path: string, init: RequestInit): Promise<Response> {
    const key = this.serviceKey!;
    try {
      return await fetch(`${this.supabaseUrl}/storage/v1${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${key}`, apikey: key },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'ismeretlen hiba';
      this.logger.error(`Supabase Storage nem érhető el (${reason})`);
      throw appError('STORAGE.UNAVAILABLE', { cause: err });
    }
  }

  private fail(operation: string, status: number): never {
    this.logger.error(`Supabase Storage hiba (${operation}): HTTP ${status}`);
    throw appError('STORAGE.UNAVAILABLE');
  }
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
