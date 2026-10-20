export interface EnvConfig {
  PORT: number;
  DATABASE_URL: string;
  DIRECT_URL?: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
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

  return {
    PORT: Number.isNaN(port) ? 3001 : port,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: directUrl,
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: corsOrigin,
  };
}
