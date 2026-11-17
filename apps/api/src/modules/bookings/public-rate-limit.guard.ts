import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { appError } from '@reform/shared';

export interface RateLimitRule {
  /** Ennyi kérés engedett az időablakban, címenként és végpontonként. */
  limit: number;
  windowMs: number;
}

const RATE_LIMIT_KEY = 'publicRateLimit';
const DEFAULT_RULE: RateLimitRule = { limit: 60, windowMs: 60_000 };
/** Ennyi címnél többet nem tart a memóriában (a lejártak törlődnek). */
const MAX_TRACKED_KEYS = 10_000;

export const RateLimit = (limit: number, windowMs = 60_000) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs } satisfies RateLimitRule);

/** A kliens címe: a Render proxyja a valódi címet az `X-Forwarded-For` végére fűzi. */
export function clientAddress(request: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): string {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded;
  const last = value?.split(',').pop()?.trim();
  return last || request.ip || 'unknown';
}

/**
 * Egyszerű, memóriabeli kéréskorlát a nyilvános foglaló végpontjaira (TICKET-57), külső
 * függőség nélkül (egy API-példány fut). Rögzített időablak címenként és végpontonként.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule =
      this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_RULE;
    const request = context.switchToHttp().getRequest();
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientAddress(request)}`;
    return this.hit(key, rule, Date.now());
  }

  hit(key: string, rule: RateLimitRule, now: number): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= MAX_TRACKED_KEYS) this.prune(now);
      this.hits.set(key, { count: 1, resetAt: now + rule.windowMs });
      return true;
    }
    entry.count++;
    if (entry.count > rule.limit) throw appError('BOOKING.RATE_LIMITED');
    return true;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
    if (this.hits.size >= MAX_TRACKED_KEYS) this.hits.clear();
  }
}
