import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service';

const message = { subject: '847291 – ReformStudio Sync belépőkód', html: '<p>Szia Márk!</p>', text: 'Szia Márk!' };
const to = { email: 'smark.siklodi@gmail.com', name: 'Siklódi Márk' };

function createService(env: Record<string, string | undefined>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new MailService({ get: (key: string) => env[key] } as any);
}

describe('MailService — SendPulse (TICKET-35)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a SendPulse SMTP API-nak küldi, Bearer kulccsal, Base64 HTML-lel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"result":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createService({
      SENDPULSE_API_KEY: 'sp-key',
      MAIL_FROM_EMAIL: 'devtest@sendpulseemail.com',
      MAIL_FROM_NAME: 'ReformStudio Sync',
    });

    await service.send(to, message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendpulse.com/smtp/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sp-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init.body));
    expect(body.email).toMatchObject({
      subject: message.subject,
      text: message.text,
      from: { name: 'ReformStudio Sync', email: 'devtest@sendpulseemail.com' },
      to: [to],
    });
    expect(Buffer.from(body.email.html, 'base64').toString('utf8')).toBe(message.html);
  });

  it('hibás válasznál MAIL_UNAVAILABLE, a naplóba csak a státusz kerül', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":"smark.siklodi@gmail.com"}', { status: 422 })),
    );
    const service = createService({ SENDPULSE_API_KEY: 'sp-key' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logger = (service as any).logger;
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(service.send(to, message)).rejects.toMatchObject({
      code: 'AUTH.MAIL_UNAVAILABLE',
      status: 502,
    });
    expect(loggerError).toHaveBeenCalledWith('SendPulse hiba: HTTP 422');
  });

  it('elérhetetlen SendPulse-nál MAIL_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const service = createService({ SENDPULSE_API_KEY: 'sp-key' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

    await expect(service.send(to, message)).rejects.toMatchObject({ code: 'AUTH.MAIL_UNAVAILABLE' });
  });

  it('kulcs nélkül nincs beállítva', () => {
    expect(createService({}).isConfigured).toBe(false);
    expect(createService({ SENDPULSE_API_KEY: '' }).isConfigured).toBe(false);
    expect(createService({ SENDPULSE_API_KEY: 'sp-key' }).isConfigured).toBe(true);
  });
});
