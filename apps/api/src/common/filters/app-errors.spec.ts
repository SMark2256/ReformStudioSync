import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  APP_ERROR_CATALOG,
  APP_ERROR_CODE_PATTERN,
  AppError,
  appError,
  AppErrorCode,
  isAppError,
  toAppError,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

const codes = Object.keys(APP_ERROR_CATALOG) as AppErrorCode[];
const AREAS = ['COMMON', 'AUTH', 'GUEST', 'PASS', 'CHECKIN', 'MEMBERSHIP', 'PAYMENT'];

describe('Hibakatalógus', () => {
  it.each(codes)('%s: TERÜLET.OK formátum, ismert terület', (code) => {
    expect(code).toMatch(APP_ERROR_CODE_PATTERN);
    expect(AREAS).toContain(code.split('.')[0]);
  });

  it.each(codes)('%s: van magyar szövege, státusza és viselkedése', (code) => {
    const def = APP_ERROR_CATALOG[code];
    expect(def.message.trim().length).toBeGreaterThan(0);
    expect(['notify', 'login', 'reload', 'retry']).toContain(def.action);
    if (code === 'COMMON.NETWORK') {
      expect(def.status).toBe(0);
    } else {
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.status).toBeLessThan(600);
    }
  });

  it('csak a lejárt munkamenet és az inaktív fiók vezet kijelentkeztetésre', () => {
    const loginCodes = codes.filter((c) => APP_ERROR_CATALOG[c].action === 'login');
    expect(loginCodes.sort()).toEqual(['AUTH.ACCOUNT_INACTIVE', 'AUTH.UNAUTHENTICATED']);
    expect(APP_ERROR_CATALOG['AUTH.INVALID_CREDENTIALS'].action).toBe('notify');
  });
});

describe('AppError / appError', () => {
  it('a katalógusból veszi a státuszt, szöveget és viselkedést', () => {
    const err = appError('PASS.NO_REMAINING');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      code: 'PASS.NO_REMAINING',
      status: 400,
      action: 'notify',
      message: APP_ERROR_CATALOG['PASS.NO_REMAINING'].message,
    });
  });

  it('a szöveg és a details felülírható, a cause megmarad', () => {
    const cause = new Error('belső');
    const err = appError('GUEST.BARCODE_TAKEN', {
      message: 'A(z) "RS1" vonalkód már foglalt.',
      details: { barcode: 'RS1' },
      cause,
    });
    expect(err.message).toBe('A(z) "RS1" vonalkód már foglalt.');
    expect(err.details).toEqual({ barcode: 'RS1' });
    expect(err.cause).toBe(cause);
    expect(err.status).toBe(409);
  });

  it('isAppError a szerializált alakot is felismeri, az ismeretlen kódot nem', () => {
    expect(isAppError({ name: 'AppError', code: 'PASS.EXPIRED' })).toBe(true);
    expect(isAppError({ name: 'AppError', code: 'NOPE.NOPE' })).toBe(false);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});

describe('toAppError', () => {
  it('AppError-t változatlanul ad vissza', () => {
    const err = appError('PASS.FROZEN');
    expect(toAppError(err)).toBe(err);
  });

  it.each([
    ['BadRequest', 'COMMON.BAD_REQUEST', 400, () => new BadRequestException('Rossz kérés.')],
    ['Unauthorized', 'AUTH.UNAUTHENTICATED', 401, () => new UnauthorizedException()],
    ['Forbidden', 'AUTH.FORBIDDEN', 403, () => new ForbiddenException('Tilos.')],
    ['NotFound', 'COMMON.NOT_FOUND', 404, () => new NotFoundException('Cannot GET /api/x')],
    ['PayloadTooLarge', 'COMMON.PAYLOAD_TOO_LARGE', 413, () => new PayloadTooLargeException()],
  ] as const)('NestJS %sException → %s (%i)', (_name, code, status, create) => {
    const err = toAppError(create());
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
  });

  it('a NestJS-kivétel szövege megmarad', () => {
    expect(toAppError(new NotFoundException('Cannot GET /api/x')).message).toBe(
      'Cannot GET /api/x',
    );
  });

  it('{ status, response } alakú hibából: ha a törzsben ismert kód van, azt használja', () => {
    const err = toAppError({
      status: 400,
      response: { code: 'PASS.EXPIRED', status: 400, message: 'Lejárt!', details: { a: 1 } },
    });
    expect(err).toMatchObject({ code: 'PASS.EXPIRED', status: 400, message: 'Lejárt!', details: { a: 1 } });
  });

  it('régi validációs lista (message: string[]) → COMMON.VALIDATION_FAILED', () => {
    const err = toAppError({
      status: 400,
      response: { statusCode: 400, message: ['email must be an email', 'name should not be empty'] },
    });
    expect(err.code).toBe('COMMON.VALIDATION_FAILED');
    expect(err.message).toBe('email must be an email, name should not be empty');
  });

  it('Express middleware hiba (statusCode) → a státuszhoz illő kód, a státusz megmarad', () => {
    const err = toAppError(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }));
    expect(err.code).toBe('COMMON.BAD_REQUEST');
    expect(err.status).toBe(429);
  });

  it('ismeretlen 5xx és sima Error → COMMON.INTERNAL', () => {
    expect(toAppError({ status: 503, response: { message: 'down' } })).toMatchObject({
      code: 'COMMON.INTERNAL',
      status: 500,
    });
    const err = toAppError(new Error('db secret'));
    expect(err.code).toBe('COMMON.INTERNAL');
    expect(err.status).toBe(500);
  });

  it('nem Error értékből is AppError lesz, katalógus-szöveggel', () => {
    const err = toAppError('valami');
    expect(err.code).toBe('COMMON.INTERNAL');
    expect(err.message).toBe(APP_ERROR_CATALOG['COMMON.INTERNAL'].message);
  });
});
