import { DEFAULT_MAIL_HOURLY_LIMIT } from '@reform/shared';

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  DIRECT_URL?: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  /** SendPulse REST API kulcs. Nélküle (csak nem production módban) a belépőkód a naplóba kerül. */
  SENDPULSE_API_KEY?: string;
  MAIL_FROM_EMAIL: string;
  MAIL_FROM_NAME: string;
  /** Rögzített belépőkód teszteknek (E2E, CI); productionben nem engedélyezett. */
  AUTH_FIXED_LOGIN_CODE?: string;
  /**
   * Dokumentumtárolás (TICKET-56, Supabase Storage). Nélküle nem production módban helyi
   * fájlrendszer (`LOCAL_STORAGE_DIR`), productionben a PDF-mentés „nincs beállítva” hibát ad.
   */
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_STORAGE_BUCKET: string;
  LOCAL_STORAGE_DIR?: string;
  /** A kimenő sor óránkénti korlátja (TICKET-55); a SendPulse teszt csomaghoz 10. */
  MAIL_HOURLY_LIMIT: number;
  /** A webapp címe a levelekben (leiratkozó link); alapból a `CORS_ORIGIN` első címe. */
  PUBLIC_WEB_URL: string;
}

const optional = (value: unknown): string | undefined => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text || undefined;
};

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const nodeEnv = String(config.NODE_ENV ?? 'development');
  const isProduction = nodeEnv === 'production';
  const port = Number(config.PORT ?? 3001);
  const databaseUrl = String(
    config.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/reformstudio?schema=public',
  );
  const directUrl = config.DIRECT_URL ? String(config.DIRECT_URL) : databaseUrl;
  const jwtSecret = String(
    config.JWT_SECRET ?? 'reform-studio-dev-secret-change-in-prod',
  );
  const corsOrigin = String(config.CORS_ORIGIN ?? '*');

  const sendpulseApiKey = optional(config.SENDPULSE_API_KEY);
  if (isProduction && !sendpulseApiKey) {
    throw new Error(
      'SENDPULSE_API_KEY hiányzik: production módban a belépőkódot csak e-mailben lehet kiküldeni.',
    );
  }

  const fixedLoginCode = optional(config.AUTH_FIXED_LOGIN_CODE);
  if (fixedLoginCode && isProduction) {
    throw new Error('AUTH_FIXED_LOGIN_CODE production módban nem használható.');
  }
  if (fixedLoginCode && !/^\d{6}$/.test(fixedLoginCode)) {
    throw new Error('AUTH_FIXED_LOGIN_CODE 6 számjegy legyen.');
  }

  const hourlyLimitRaw = optional(config.MAIL_HOURLY_LIMIT);
  const hourlyLimit = hourlyLimitRaw === undefined ? DEFAULT_MAIL_HOURLY_LIMIT : Number(hourlyLimitRaw);
  if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1 || hourlyLimit > 10_000) {
    throw new Error('MAIL_HOURLY_LIMIT 1 és 10000 közötti egész szám legyen.');
  }

  const publicWebUrl =
    optional(config.PUBLIC_WEB_URL) ??
    corsOrigin.split(',').map((o) => o.trim()).find((o) => /^https?:\/\//.test(o)) ??
    'http://localhost:5173';

  return {
    NODE_ENV: nodeEnv,
    PORT: Number.isNaN(port) ? 3001 : port,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: corsOrigin,
    SENDPULSE_API_KEY: sendpulseApiKey,
    MAIL_FROM_EMAIL: optional(config.MAIL_FROM_EMAIL) ?? 'devtest@sendpulseemail.com',
    MAIL_FROM_NAME: optional(config.MAIL_FROM_NAME) ?? 'ReformStudio Sync',
    AUTH_FIXED_LOGIN_CODE: fixedLoginCode,
    SUPABASE_URL: optional(config.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: optional(config.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_STORAGE_BUCKET: optional(config.SUPABASE_STORAGE_BUCKET) ?? 'guest-documents',
    LOCAL_STORAGE_DIR: optional(config.LOCAL_STORAGE_DIR),
    MAIL_HOURLY_LIMIT: hourlyLimit,
    PUBLIC_WEB_URL: publicWebUrl.replace(/\/+$/, ''),
  };
}
