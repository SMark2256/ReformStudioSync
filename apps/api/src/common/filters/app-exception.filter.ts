import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { APP_ERROR_CATALOG, ApiErrorBody, toAppError } from '@reform/shared';
import { Response } from 'express';

/**
 * Minden HTTP-hibát egységes `ApiErrorBody` válasszá alakít.
 * 5xx esetén a belső részletek (details, stack, eredeti üzenet) csak a logba
 * kerülnek, a kliens a katalógus általános szövegét kapja.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;

    const error = toAppError(exception);
    const response = host.switchToHttp().getResponse<Response>();
    const isServerError = error.status >= 500;

    if (isServerError) {
      this.logger.error(
        `${error.code}: ${error.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorBody = isServerError
      ? {
          code: 'COMMON.INTERNAL',
          status: error.status,
          message: APP_ERROR_CATALOG['COMMON.INTERNAL'].message,
        }
      : {
          code: error.code,
          status: error.status,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        };

    response.status(error.status).json(body);
  }
}
