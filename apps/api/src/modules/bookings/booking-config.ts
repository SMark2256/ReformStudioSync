import { ConfigService } from '@nestjs/config';

const DEV_SECRET = 'reform-studio-dev-secret-change-in-prod';

/** A kezelőlink és a vendég munkamenet titka: a JWT titokból származtatva, attól elkülönítve. */
export function guestTokenSecret(config: ConfigService): string {
  return `${config.get<string>('JWT_SECRET') ?? DEV_SECRET}:guest-booking`;
}

/** A webes felület nyilvános címe a levelek linkjeihez (`/foglalas/...`). */
export function publicWebUrl(config: ConfigService): string {
  const explicit = config.get<string>('PUBLIC_WEB_URL');
  if (explicit) return explicit.replace(/\/+$/, '');
  const cors = config.get<string>('CORS_ORIGIN');
  const first = cors && cors !== '*' ? cors.split(',')[0]?.trim() : undefined;
  return (first || 'http://localhost:5173').replace(/\/+$/, '');
}
