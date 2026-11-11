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
});
