import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Vendégoldali tokenek (TICKET-57). Az adatbázisban csak a SHA-256 hash van, maga a token soha.
 *
 * A foglalás kezelőlinkjének tokenje a foglalás azonosítójából és a szerver titkából számolt
 * HMAC, így minden levélbe (visszaigazolás, emlékeztető, módosítás) ugyanaz a link kerülhet,
 * tárolás nélkül. A várólistás ajánlat tokenje véletlen, ajánlatonként új.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Alakra érvényes-e a token (a hash-keresés előtt, hogy szemét ne menjen az adatbázisba). */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

export function manageTokenFor(secret: string, bookingId: string): string {
  return createHmac('sha256', secret).update(`booking-manage:${bookingId}`).digest('base64url');
}

export function createRandomToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashOpaqueToken(token) };
}

/**
 * Vendég munkamenet a nyilvános foglalón (`<vendég>.<lejárat ms>.<HMAC>`): a kódos belépés után
 * kapja meg a böngésző, tárolás nélkül ellenőrizhető. Csak a vendég azonosítóját hordozza.
 */
export function signGuestSession(secret: string, guestId: string, expiresAt: Date): string {
  const payload = `${guestId}.${expiresAt.getTime()}`;
  return `${payload}.${createHmac('sha256', secret).update(`guest-session:${payload}`).digest('base64url')}`;
}

/** A munkamenet vendégazonosítója, vagy `null`, ha hibás, hamisított vagy lejárt. */
export function verifyGuestSession(secret: string, token: unknown, now: Date): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [guestId, expires, signature] = parts;
  const expected = createHmac('sha256', secret).update(`guest-session:${guestId}.${expires}`).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const expiresMs = Number(expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) return null;
  return guestId;
}
