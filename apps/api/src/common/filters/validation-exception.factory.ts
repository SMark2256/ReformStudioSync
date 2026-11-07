import { ValidationError } from '@nestjs/common';
import { AppError, appError } from '@reform/shared';

export interface ValidationFieldError {
  field: string;
  messages: string[];
}

function collectFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationFieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...collectFieldErrors(error.children ?? [], field)];
  });
}

/**
 * A `ValidationPipe` hibáiból `COMMON.VALIDATION_FAILED` lesz. A szöveg a
 * korábbi (NestJS alapértelmezett) üzenetlista vesszővel összefűzve, a
 * mezőnkénti bontás a `details.fields`-ben megy.
 */
export function validationExceptionFactory(errors: ValidationError[]): AppError {
  const fields = collectFieldErrors(errors);
  const messages = fields.flatMap(({ field, messages: fieldMessages }) => {
    const parent = field.includes('.') ? field.slice(0, field.lastIndexOf('.')) : '';
    return parent ? fieldMessages.map((m) => `${parent}.${m}`) : fieldMessages;
  });

  return appError('COMMON.VALIDATION_FAILED', {
    message: messages.length > 0 ? messages.join(', ') : undefined,
    details: { fields },
  });
}
