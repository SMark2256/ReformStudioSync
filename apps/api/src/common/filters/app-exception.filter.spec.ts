import {
  ArgumentsHost,
  ForbiddenException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { APP_ERROR_CATALOG, appError } from '@reform/shared';
import { IsEmail, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppExceptionFilter } from './app-exception.filter';
import { validationExceptionFactory } from './validation-exception.factory';

function createHost() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

class AddressDto {
  @IsString()
  @IsNotEmpty()
  city: string;
}

class CreateGuestTestDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}

describe('AppExceptionFilter', () => {
  const filter = new AppExceptionFilter();
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('4xx AppError: kód, státusz, szöveg és details a válaszban', () => {
    const { host, res } = createHost();
    filter.catch(
      appError('GUEST.BARCODE_TAKEN', { message: 'Foglalt: RS1', details: { barcode: 'RS1' } }),
      host,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      code: 'GUEST.BARCODE_TAKEN',
      status: 409,
      message: 'Foglalt: RS1',
      details: { barcode: 'RS1' },
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('details nélkül nincs details mező', () => {
    const { host, res } = createHost();
    filter.catch(appError('PASS.EXPIRED'), host);
    expect(res.body).toEqual({
      code: 'PASS.EXPIRED',
      status: 400,
      message: APP_ERROR_CATALOG['PASS.EXPIRED'].message,
    });
  });

  it('nyers NestJS-kivétel is kódot kap, a szöveg megmarad', () => {
    const { host, res } = createHost();
    filter.catch(new ForbiddenException('Nincs jog.'), host);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ code: 'AUTH.FORBIDDEN', status: 403, message: 'Nincs jog.' });
  });

  it('5xx: a belső szöveg, details és stack nem megy ki, csak a logba', () => {
    const { host, res } = createHost();
    const internal = Object.assign(new Error('connection to db at 10.0.0.5 failed'), {
      details: { secret: 'x' },
    });
    filter.catch(internal, host);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      code: 'COMMON.INTERNAL',
      status: 500,
      message: APP_ERROR_CATALOG['COMMON.INTERNAL'].message,
    });
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    expect(JSON.stringify(res.body)).not.toContain('stack');
    expect(logError).toHaveBeenCalledTimes(1);
    expect(String(logError.mock.calls[0][0])).toContain('10.0.0.5');
  });

  it('nem HTTP kontextusban továbbdobja a hibát', () => {
    const host = { getType: () => 'ws' } as unknown as ArgumentsHost;
    const err = appError('PASS.EXPIRED');
    expect(() => filter.catch(err, host)).toThrow(err);
  });

  it('ValidationPipe hiba → COMMON.VALIDATION_FAILED mezőlistával, a régi szöveggel', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    });

    const thrown = await pipe
      .transform(
        { name: '', email: 'nem-email', address: { city: '' } },
        { type: 'body', metatype: CreateGuestTestDto },
      )
      .catch((e: unknown) => e);

    const { host, res } = createHost();
    filter.catch(thrown, host);

    expect(res.statusCode).toBe(400);
    const body = res.body as { code: string; message: string; details: { fields: { field: string; messages: string[] }[] } };
    expect(body.code).toBe('COMMON.VALIDATION_FAILED');
    expect(body.details.fields.map((f) => f.field)).toEqual(['name', 'email', 'address.city']);
    expect(body.message).toContain('email must be an email');
    expect(body.message).toContain('address.city should not be empty');
  });
});
