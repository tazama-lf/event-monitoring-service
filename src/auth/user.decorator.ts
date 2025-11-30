import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

// Export the callback function separately for testing
export const getUserFromContext = (data: unknown, ctx: ExecutionContext): unknown => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
};

export const User = createParamDecorator(getUserFromContext);
