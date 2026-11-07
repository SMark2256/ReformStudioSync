import { ValidationError } from '@nestjs/common';
import { AppError, appError } from '@reform/shared';

interface FieldError {
  field: string;
  messages: string[];
}

/**
 * Mezőnkénti hibák és a NestJS alapértelmezett üzenetlistája (beágyazott
 * mezőnél a szülő útvonalával előtagolva) egy bejárással.
 */
function collect(
  errors: ValidationError[],
  parentPath = '',
  out: { fields: FieldError[]; messages: string[] } = { fields: [], messages: [] },
) {
  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      const messages = Object.values(error.constraints);
      out.fields.push({ field, messages });
      out.messages.push(
        ...(parentPath ? messages.map((m) => `${parentPath}.${m}`) : messages),
      );
    }
    collect(error.children ?? [], field, out);
  }
  return out;
}

/**
 * A `ValidationPipe` hibáiból `COMMON.VALIDATION_FAILED` lesz. A szöveg a
 * korábbi (NestJS alapértelmezett) üzenetlista vesszővel összefűzve, a
 * mezőnkénti bontás a `details.fields`-ben megy.
 */
export function validationExceptionFactory(errors: ValidationError[]): AppError {
  const { fields, messages } = collect(errors);
  return appError('COMMON.VALIDATION_FAILED', {
    message: messages.length > 0 ? messages.join(', ') : undefined,
    details: { fields },
  });
}
