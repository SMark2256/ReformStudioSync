import {
  APP_ERROR_CATALOG,
  AppErrorAction,
  AppErrorCode,
  isAppErrorCode,
} from './catalog';

/** Az API minden hibaválaszának egységes törzse. */
export interface ApiErrorBody {
  code: AppErrorCode;
  status: number;
  message: string;
  details?: unknown;
}

export interface AppErrorOptions {
  /** Felülírja a katalógus alapszövegét (pl. vonalkóddal, névvel kiegészítve). */
  message?: string;
  details?: unknown;
  cause?: unknown;
  /** Csak idegen hibák normalizálásához: megtartja az eredeti HTTP-státuszt. */
  status?: number;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly action: AppErrorAction;
  readonly details?: unknown;
  declare cause?: unknown;

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    const definition = APP_ERROR_CATALOG[code];
    super(options.message ?? definition.message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? definition.status;
    this.action = definition.action;
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function appError(code: AppErrorCode, options?: AppErrorOptions): AppError {
  return new AppError(code, options);
}

export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AppError' &&
    isAppErrorCode((error as { code?: unknown }).code)
  );
}

interface HttpLikeError {
  status: number;
  body: unknown;
}

/**
 * Felismeri a HTTP-státuszt hordozó hibákat: NestJS `HttpException`
 * (`getStatus()` / `getResponse()`), `{ status, response }` alakú objektumok,
 * és az Express middleware-ek `status` / `statusCode` mezős hibái.
 */
function readHttpLike(error: unknown): HttpLikeError | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as {
    getStatus?: () => number;
    getResponse?: () => unknown;
    status?: unknown;
    statusCode?: unknown;
    response?: unknown;
    message?: unknown;
  };

  if (typeof candidate.getStatus === 'function') {
    return {
      status: candidate.getStatus(),
      body:
        typeof candidate.getResponse === 'function'
          ? candidate.getResponse()
          : candidate.response,
    };
  }

  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.statusCode === 'number'
        ? candidate.statusCode
        : null;
  if (status === null) return null;

  return {
    status,
    body:
      candidate.response !== undefined
        ? candidate.response
        : { message: candidate.message },
  };
}

function readMessages(body: unknown): string[] {
  if (typeof body === 'string') return body ? [body] : [];
  if (typeof body !== 'object' || body === null) return [];
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.filter((m): m is string => typeof m === 'string');
  }
  return typeof message === 'string' && message ? [message] : [];
}

function codeForStatus(status: number, isValidationList: boolean): AppErrorCode {
  if (status === 400) {
    return isValidationList ? 'COMMON.VALIDATION_FAILED' : 'COMMON.BAD_REQUEST';
  }
  if (status === 401) return 'AUTH.UNAUTHENTICATED';
  if (status === 403) return 'AUTH.FORBIDDEN';
  if (status === 404) return 'COMMON.NOT_FOUND';
  if (status === 409) return 'COMMON.CONFLICT';
  if (status === 413) return 'COMMON.PAYLOAD_TOO_LARGE';
  if (status >= 400 && status < 500) return 'COMMON.BAD_REQUEST';
  return 'COMMON.INTERNAL';
}

function fromHttpLike({ status, body }: HttpLikeError, cause: unknown): AppError {
  if (typeof body === 'object' && body !== null) {
    const { code, message, details } = body as Partial<ApiErrorBody>;
    if (isAppErrorCode(code)) {
      return appError(code, {
        message: typeof message === 'string' && message ? message : undefined,
        details,
        status,
        cause,
      });
    }
  }

  const isValidationList =
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as { message?: unknown }).message);
  const messages = readMessages(body);
  const code = codeForStatus(status, isValidationList);

  return appError(code, {
    message: messages.length > 0 ? messages.join(', ') : undefined,
    details: isValidationList ? { errors: messages } : undefined,
    status: status >= 400 && status < 500 ? status : undefined,
    cause,
  });
}

/**
 * Bármilyen hibát `AppError`-rá alakít. A HTTP-státuszt hordozó hibák a
 * státuszuk alapján kapnak `COMMON.*` / `AUTH.*` kódot (a szövegük megmarad),
 * minden más `COMMON.INTERNAL` lesz.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const httpLike = readHttpLike(error);
  if (httpLike) return fromHttpLike(httpLike, error);

  const message =
    error instanceof Error && error.message ? error.message : undefined;
  return appError('COMMON.INTERNAL', { message, cause: error });
}
