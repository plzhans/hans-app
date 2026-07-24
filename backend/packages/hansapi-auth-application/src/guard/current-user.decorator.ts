import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from './auth-user';

/**
 * 핸들러 인자에 인증된 사용자를 주입한다. AuthGuard 를 통과한 라우트에서만 값이 있다.
 * @Public() 라우트에서 쓰면 UnauthorizedException 을 던진다(인증 정보가 없으므로).
 *
 * 예) findMe(@CurrentUser() user: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (!request.user) {
      throw new UnauthorizedException('No authentication context.');
    }
    return request.user;
  },
);
