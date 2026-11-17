/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';

const createService = (env: Record<string, string | undefined>) =>
  new StorageService({ get: (key: string) => env[key] } as any);

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return undefined;
};

describe('StorageService — dokumentumtárolás (TICKET-56)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reform-storage-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('beállítás nélkül nem production módban helyi fájlrendszer, productionben „nincs beállítva”', () => {
    expect(createService({ NODE_ENV: 'development' }).mode).toBe('local');
    expect(createService({}).mode).toBe('local');
    expect(createService({ NODE_ENV: 'production' }).mode).toBe('unconfigured');
    expect(
      createService({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      }).mode,
    ).toBe('supabase');
  });

  it('production módban beállítás nélkül hibát ad, nem omlik össze', async () => {
    const service = createService({ NODE_ENV: 'production' });
    await expect(service.upload('a.pdf', Buffer.from('x'), 'application/pdf')).rejects.toMatchObject({
      code: 'STORAGE.NOT_CONFIGURED',
    });
    await expect(service.createLink('a.pdf')).rejects.toMatchObject({ code: 'STORAGE.NOT_CONFIGURED' });
  });

  it('helyi tároló: feltöltés, letöltés és lejáró, aláírt link', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T10:00:00Z'), toFake: ['Date'] });
    const service = createService({ LOCAL_STORAGE_DIR: dir, JWT_SECRET: 'secret' });
    await service.upload('intake/g1/doc.pdf', Buffer.from('%PDF-1.7'), 'application/pdf');
    expect((await service.download('intake/g1/doc.pdf')).toString()).toBe('%PDF-1.7');

    const link = await service.createLink('intake/g1/doc.pdf', 60);
    expect(link.url).toMatch(/^\/storage\/local\//);
    expect(link.expiresAt).toBe('2026-11-17T10:01:00.000Z');
    const token = link.url.replace('/storage/local/', '');
    expect(service.resolveLocalToken(token)).toBe('intake/g1/doc.pdf');

    const [key, expiresAt] = token.split('.');
    expect(errorCode(() => service.resolveLocalToken(`${key}.${expiresAt}.hamis`))).toBe(
      'STORAGE.LINK_INVALID',
    );
    const otherSecret = createService({ LOCAL_STORAGE_DIR: dir, JWT_SECRET: 'other' });
    expect(errorCode(() => otherSecret.resolveLocalToken(token))).toBe('STORAGE.LINK_INVALID');

    vi.setSystemTime(new Date('2026-11-17T10:02:00Z'));
    expect(errorCode(() => service.resolveLocalToken(token))).toBe('STORAGE.LINK_INVALID');
  });

  it('a helyi kulcs nem léphet ki a tároló gyökeréből', async () => {
    const service = createService({ LOCAL_STORAGE_DIR: dir });
    await expect(service.upload('../kint.pdf', Buffer.from('x'), 'application/pdf')).rejects.toMatchObject({
      code: 'STORAGE.LINK_INVALID',
    });
  });

  it('Supabase: privát bucketbe tölt fel service role kulccsal, aláírt, lejáró linket ad', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signedURL: '/object/sign/docs/intake/a%20b.pdf?token=t' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({
      SUPABASE_URL: 'https://x.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      SUPABASE_STORAGE_BUCKET: 'docs',
    });

    await service.upload('intake/a b.pdf', Buffer.from('%PDF'), 'application/pdf');
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe('https://x.supabase.co/storage/v1/object/docs/intake/a%20b.pdf');
    expect(uploadInit.method).toBe('POST');
    expect((uploadInit.headers as Record<string, string>).Authorization).toBe('Bearer service-key');

    const link = await service.createLink('intake/a b.pdf', 300);
    const [signUrl, signInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(signUrl).toBe('https://x.supabase.co/storage/v1/object/sign/docs/intake/a%20b.pdf');
    expect(JSON.parse(String(signInit.body))).toEqual({ expiresIn: 300 });
    expect(link.url).toBe('https://x.supabase.co/storage/v1/object/sign/docs/intake/a%20b.pdf?token=t');
  });

  it('Supabase hiba vagy elérhetetlenség: STORAGE.UNAVAILABLE', async () => {
    const service = createService({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    });
    vi.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(service.upload('a.pdf', Buffer.from('x'), 'application/pdf')).rejects.toMatchObject({
      code: 'STORAGE.UNAVAILABLE',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(service.download('a.pdf')).rejects.toMatchObject({ code: 'STORAGE.UNAVAILABLE' });
  });
});
