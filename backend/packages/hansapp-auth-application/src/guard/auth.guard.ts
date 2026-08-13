import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TokenService } from '../token/token.service';
import { SessionCache } from '../session-cache.service';
import { ApiAccessService } from '../app/api-access.service';
import type { ApiAccess } from '../app/api-access.service';
import { AuthType } from './auth-type.enum';
import { AUTH_TYPES_KEY } from './auth.decorator';
import { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';

/** 요청에 실린 인증 결과. JWT 면 user, API 접근이면 apiAccess 가 채워진다. */
type AuthedRequest = Request & { user?: AuthUser; apiAccess?: ApiAccess };

/**
 * 전역 인증 가드. 라우트가 선언한 인증 방식(@Auth(...))에 따라 검증한다.
 * - @Public() 라우트는 우회한다(로그인·가입·소셜 콜백 등).
 * - AuthType.ApiKey: 외부 앱의 API 접근(서비스 키 Bearer sk_... 또는 X-Client-Id). request.apiAccess 채움.
 * - AuthType.Jwt: 사용자 access token(JWT). request.user 채움.
 * - 둘 다 선언된 라우트는, 요청에 API 접근 자격(sk_/X-Client-Id)이 있으면 그쪽을, 없으면 JWT 를 쓴다.
 * - 어느 방식도 통과 못 하면 401.
 *
 * refresh token 은 여기서 다루지 않는다 — /oauth/token 에서만 교환된다.
 *
 * **JWT 는 서명 검증만으로 끝나지 않는다.** 서명이 맞아도 그 세션이 아직 살아 있는지를
 * 한 번 더 본다(SessionCache). 그러지 않으면 관리자가 기기를 끊어도 access token 이
 * 만료될 때까지(기본 1시간) 그대로 통한다 — 캐시를 사이에 둬서 DB 는 거의 보지 않는다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly sessions: SessionCache,
    private readonly apiAccess: ApiAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const authTypes = this.reflector.getAllAndOverride<AuthType[]>(AUTH_TYPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [AuthType.Jwt];

    // API 접근(서비스 키/클라이언트)을 지원하고, 요청에 그 자격이 실려 있으면 우선 처리한다.
    if (authTypes.includes(AuthType.ApiKey) && this.apiAccess.hasCredentials(request)) {
      request.apiAccess = await this.apiAccess.authenticate(request);
      return true;
    }

    // 사용자 access token(JWT).
    if (authTypes.includes(AuthType.Jwt)) {
      const token = this.extractToken(request);
      if (!token) {
        throw new UnauthorizedException('Authentication token is required.');
      }
      const payload = this.tokenService.verifyAccessToken(token);
      /*
        **끊긴 세션의 토큰인지 본다.** 서명은 폐기를 알지 못한다 — 관리자가 기기를 끊었거나
        본인이 로그아웃했으면 여기서 막힌다. 캐시 히트가 대부분이라 비용은 메모리 조회다.

        토큰의 `exp` 를 함께 넘긴다 — 캐시가 그 시각을 넘겨 판단을 들고 있지 않게 한다.
      */
      const userId = Number(payload.sub);
      if (!(await this.sessions.isLive(userId, payload.sid, payload.exp))) {
        throw new UnauthorizedException('Session is no longer valid.');
      }
      request.user = {
        userId,
        role: payload.role,
        sessionId: payload.sid,
      };
      return true;
    }

    throw new UnauthorizedException('Authentication credentials are required.');
  }

  /** Authorization: Bearer <token> 에서 토큰을 추출한다. 스킴은 대소문자 무관(RFC 7235). */
  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.trim().split(/\s+/);
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
