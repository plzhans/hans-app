import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import type { AdminAuthUser } from './admin-auth-user';

/** 가드가 채운 관리자 인증 결과를 핸들러 인자로 받는다. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminAuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { admin?: AdminAuthUser }>();
    if (!request.admin) {
      throw new UnauthorizedException('No admin authentication context.');
    }
    return request.admin;
  },
);
