import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionExpiredError } from '../error';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@hansapp/common';
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
 * - 어느 방식도 통과 못 하면 401.
 *
 * **둘 다 실려 오면 사용자 토큰이 이기고, X-Client-Id 헤더는 무시한다.**
 * 그때 앱은 **토큰의 `app` 클레임**에서 읽는다 — 서버가 인가코드를 발급할 때 정해 세션에
 * 적어 둔 값이라 위조할 수 없다. 헤더는 부르는 쪽이 아무 값이나 넣을 수 있어서 토큰을 발급한
 * 앱과 다를 수 있고, 그 값으로 사용량을 세면 남의 몫으로 기록된다.
 *
 * 예전에는 앱 자격이 있으면 거기서 끝냈다. 그러면 브라우저가 두 헤더를 함께 보낼 때 사람이
 * 보이지 않아, 사용량이 로그인 여부와 무관하게 앱 통에서만 깎였다.
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

    const bearer = this.extractToken(request);
    // 서비스 키(sk_)도 Bearer 로 오므로 사용자 토큰과 갈라 둔다.
    const userToken = bearer && !bearer.startsWith('sk_') ? bearer : null;
    const hasApiCredentials = this.apiAccess.hasCredentials(request);

    // 사용자 토큰이 이긴다(위 주석 참고). 앱은 헤더가 아니라 토큰이 말한다.
    if (authTypes.includes(AuthType.Jwt) && userToken) {
      const { user, appId } = await this.authenticateUser(userToken);
      request.user = user;
      if (appId !== undefined) {
        request.apiAccess = { appId, via: 'token' };
      }
      return true;
    }

    // 앱·서비스 키만 실린 요청(로그인 전 브라우저, 서버-서버 호출).
    if (authTypes.includes(AuthType.ApiKey) && hasApiCredentials) {
      request.apiAccess = await this.apiAccess.authenticate(request);
      return true;
    }

    if (authTypes.includes(AuthType.Jwt)) {
      throw new UnauthorizedError({ message: 'Authentication token is required.' });
    }
    throw new UnauthorizedError({ message: 'Authentication credentials are required.' });
  }

  /** access token 을 검증해 요청에 실을 사용자와 발급 앱으로 바꾼다. */
  private async authenticateUser(token: string): Promise<{ user: AuthUser; appId?: number }> {
    const payload = this.tokenService.verifyAccessToken(token);
    /*
      **끊긴 세션의 토큰인지 본다.** 서명은 폐기를 알지 못한다 — 관리자가 기기를 끊었거나
      본인이 로그아웃했으면 여기서 막힌다. 캐시 히트가 대부분이라 비용은 메모리 조회다.

      토큰의 `exp` 를 함께 넘긴다 — 캐시가 그 시각을 넘겨 판단을 들고 있지 않게 한다.
    */
    const userId = Number(payload.sub);
    if (!(await this.sessions.isLive(userId, payload.sid, payload.exp))) {
      throw new SessionExpiredError({ message: 'Session is no longer valid.' });
    }
    return {
      user: {
        userId,
        role: payload.role,
        sessionId: payload.sid,
      },
      // 1st-party 로그인에는 앱이 없다(클레임 자체가 빠진다).
      appId: payload.app,
    };
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
