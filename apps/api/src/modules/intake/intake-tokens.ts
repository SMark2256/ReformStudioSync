import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/** A vendégmód tokenje: 32 bájt véletlen, az adatbázisban csak a SHA-256 hash-e van. */
export function createGuestToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashGuestToken(token) };
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 6 jegyű kilépési kód; a hash a munkamenethez kötött (más kitöltésnél nem érvényes). */
export function createExitCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashExitCode(secret: string, sessionId: string, code: string): string {
  return createHmac('sha256', secret).update(`${sessionId}:${code.trim()}`).digest('hex');
}

export function exitCodeMatches(
  secret: string,
  sessionId: string,
  code: string,
  expectedHash: string | null,
): boolean {
  if (!expectedHash) return false;
  const actual = Buffer.from(hashExitCode(secret, sessionId, code));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
