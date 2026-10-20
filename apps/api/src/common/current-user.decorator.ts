import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUserDto } from '@reform/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
