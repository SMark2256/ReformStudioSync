import { createHash, createHmac, randomBytes } from 'crypto';

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
