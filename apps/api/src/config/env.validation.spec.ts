import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

describe('validateEnv — levélküldés és tesztkód (TICKET-35)', () => {
  it('alapértelmezett feladó, kulcs nélkül fejlesztői módban elindul', () => {
    expect(validateEnv({})).toMatchObject({
      NODE_ENV: 'development',
      SENDPULSE_API_KEY: undefined,
      MAIL_FROM_EMAIL: 'devtest@sendpulseemail.com',
      MAIL_FROM_NAME: 'ReformStudio Sync',
      AUTH_FIXED_LOGIN_CODE: undefined,
    });
  });

  it('productionben a SendPulse kulcs kötelező', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/SENDPULSE_API_KEY/);
    expect(() => validateEnv({ NODE_ENV: 'production', SENDPULSE_API_KEY: '  ' })).toThrow(
      /SENDPULSE_API_KEY/,
    );
    expect(validateEnv({ NODE_ENV: 'production', SENDPULSE_API_KEY: 'sp-key' }).SENDPULSE_API_KEY).toBe(
      'sp-key',
    );
  });

  it('rögzített belépőkód csak production módon kívül, 6 számjeggyel', () => {
    expect(validateEnv({ NODE_ENV: 'test', AUTH_FIXED_LOGIN_CODE: '123456' }).AUTH_FIXED_LOGIN_CODE).toBe(
      '123456',
    );
    expect(() =>
      validateEnv({ NODE_ENV: 'production', SENDPULSE_API_KEY: 'sp-key', AUTH_FIXED_LOGIN_CODE: '123456' }),
    ).toThrow(/AUTH_FIXED_LOGIN_CODE/);
    expect(() => validateEnv({ AUTH_FIXED_LOGIN_CODE: '12345' })).toThrow(/AUTH_FIXED_LOGIN_CODE/);
  });

  it('kimenő sor: óránkénti korlát és a webapp címe (TICKET-55)', () => {
    expect(validateEnv({})).toMatchObject({ MAIL_HOURLY_LIMIT: 10, PUBLIC_WEB_URL: 'http://localhost:5173' });
    expect(validateEnv({ MAIL_HOURLY_LIMIT: '120' }).MAIL_HOURLY_LIMIT).toBe(120);
    expect(() => validateEnv({ MAIL_HOURLY_LIMIT: '0' })).toThrow(/MAIL_HOURLY_LIMIT/);
    expect(() => validateEnv({ MAIL_HOURLY_LIMIT: 'sok' })).toThrow(/MAIL_HOURLY_LIMIT/);
    expect(
      validateEnv({ CORS_ORIGIN: '*' }).PUBLIC_WEB_URL,
    ).toBe('http://localhost:5173');
    expect(
      validateEnv({ CORS_ORIGIN: 'https://reform.pages.dev,http://localhost:5173' }).PUBLIC_WEB_URL,
    ).toBe('https://reform.pages.dev');
    expect(
      validateEnv({ PUBLIC_WEB_URL: 'https://app.reformstudio.hu/', CORS_ORIGIN: 'https://x.dev' }).PUBLIC_WEB_URL,
    ).toBe('https://app.reformstudio.hu');
  });
});
