import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TokenService } from '../token/token.service';
import { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * 전역 인증 가드. Authorization: Bearer <access token> 을 검증한다.
 * - @Public() 라우트는 우회한다(로그인·가입·소셜 콜백 등).
 * - access token(JWT)의 서명·만료를 검증하고 request.user 에 사용자 정보를 채운다.
 * - 검증 실패는 401.
 *
 * refresh token 은 여기서 다루지 않는다 — /oauth/token 에서만 교환된다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    const payload = this.tokenService.verifyAccessToken(token);
    request.user = {
      userId: Number(payload.sub),
      role: payload.role,
      sessionId: payload.sid,
    };
    return true;
  }

  /** Authorization: Bearer <token> 에서 토큰을 추출한다. */
  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
