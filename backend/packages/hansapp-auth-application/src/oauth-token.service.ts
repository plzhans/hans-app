import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthErrorCode, InvalidRedirectUriError } from './error';
import { AuthLogResult, AppStatus, AuthLogAction, UserStatus } from '@hansapp/data';
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
  sha256base64url,
  sha256hex,
  timingSafeEqualHex,
} from '@hansapp/common';

import { AccessCache } from './app/access-cache.service';
import { AUTH_CONFIG } from './auth.config';
import type { AuthConfig } from './auth.config';
import { isFirstPartyOrigin } from './first-party-origin';
import { RequestMeta } from './auth.service';
import { AuthLogService } from './log/auth-log.service';
import { LoginService } from './login.service';
import { UserRepository } from './repository/user.repository';
import { TokenSessionRepository } from './repository/token-session.repository';
import { AuthTokens, TokenService } from './token/token.service';

/**
 * OAuth2 토큰 엔드포인트(/oauth/token)의 grant 처리.
 * - authorization_code: 소셜 콜백이 프론트로 넘긴 릴레이 인가코드를 토큰으로 교환한다.
 * - refresh_token: 불투명 refresh token 을 rotate 하고 새 토큰을 발급한다.
 */
@Injectable()
export class OAuthTokenService {
  /*
    **거절한 이유를 여기서 남긴다.** 밖으로 나가는 것은 코드와 한 문장뿐이고, 그래야 한다 —
    어느 검사에서 걸렸는지까지 알려 주면 등록 상태를 밖에서 떠볼 수 있다. 대신 우리는
    알아야 하므로 던지기 직전에 debug 로 적는다(전역 필터의 줄과 요청 id 로 이어진다).
  */
  private readonly logger = new Logger(OAuthTokenService.name);

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
    private readonly log: AuthLogService,
    private readonly login: LoginService,
    private readonly access: AccessCache,
    private readonly sessions: TokenSessionRepository,
  ) {}

  /**
   * SSO 인가코드 발급. 로그인된 사용자가 다른 클라이언트로 로그인을 릴레이할 때,
   * return_to(허용목록 오리진)로 넘길 1회용 코드를 만든다.
   */
  async issueAuthorizationCode(
    userId: number,
    returnTo: string,
    clientId?: string,
    codeChallenge?: string,
    /**
     * 이 릴레이를 요청한 **지금 세션**의 식별자. 그 세션의 "로그인 상태 유지" 를 그대로
     * 물려준다 — 한 번 한 선택이 옮겨 가는 앱마다 달라지면 체크박스의 뜻이 흐려진다.
     * 없으면(못 찾으면) 유지하지 않는 쪽으로 떨어진다.
     */
    sessionId?: number,
  ): Promise<string> {
    // PKCE 는 **모든 인가코드에 필수**다. 선택으로 두면 공격자가 challenge 를 빼고 요청해
    // 검증을 건너뛸 수 있다(downgrade). 예외를 두지 않아야 그 경로가 안 생긴다.
    const challenge = assertCodeChallenge(codeChallenge);

    let origin: string;
    try {
      origin = new URL(returnTo).origin;
    } catch {
      throw new InvalidRedirectUriError({ message: 'Malformed redirect_uri.' });
    }

    // 외부 앱: 등록된 리디렉션 URI 와 **정확히** 일치해야 한다(OAuth 의 redirect_uri 규칙).
    // 오리진만 보면 같은 사이트의 아무 경로로나 코드를 흘릴 수 있다.
    if (clientId) {
      const client = await this.access.getClient(clientId);
      if (!client || client.status !== AppStatus.ACTIVE) {
        this.logger.debug(`Auth code rejected: unknown or inactive client (clientId=${clientId})`);
        throw new BadRequestError(AuthErrorCode.OAUTH_INVALID_CLIENT);
      }
      const allowed = (client.redirectUris as string[] | null) ?? [];
      if (!allowed.includes(returnTo)) {
        this.logger.debug(
          `Auth code rejected: redirect_uri not registered (clientId=${clientId} returnTo=${returnTo})`,
        );
        throw new InvalidRedirectUriError({
          message: 'redirect_uri is not a registered redirect URI.',
        });
      }
      return this.tokens.issueAuthCode(
        userId,
        client.clientId,
        challenge,
        null,
        await this.isPersistentSession(userId, sessionId),
      );
    }

    // 1st-party(hansapp-web): 자기 자신은 클라이언트로 등록하지 않으므로 서비스 루트 도메인으로 판별한다.
    if (!isFirstPartyOrigin(origin, this.config.rootDomain)) {
      this.logger.debug(`Auth code rejected: return_to is not first-party (origin=${origin})`);
      throw new InvalidRedirectUriError();
    }
    return this.tokens.issueAuthCode(
      userId,
      null,
      challenge,
      null,
      await this.isPersistentSession(userId, sessionId),
    );
  }

  /**
   * 지금 세션이 "로그인 상태 유지" 로 만들어졌나.
   *
   * **모르면 유지하지 않는다.** 세션을 못 찾는 경우(방금 폐기됨 등)에 유지 쪽으로 기울면,
   * 사용자가 끄고 로그인했는데 옮겨 간 앱에서만 남는 일이 생긴다 — 안전한 쪽으로 떨어뜨린다.
   */
  private async isPersistentSession(userId: number, sessionId?: number): Promise<boolean> {
    if (!sessionId) return false;
    // 키가 복합키라 회원까지 있어야 행을 가리킬 수 있다.
    const session = await this.sessions.findOwned(userId, sessionId);
    return session?.persistent ?? false;
  }

  /**
   * **1st-party 전용 오리진 검사.** 쿠키를 자격증명으로 쓰는 경로가 호출한다.
   *
   * 쿠키는 브라우저가 교차출처 요청에도 자동으로 실어 보내므로, 오리진을 안 보면 아무 사이트나
   * 남의 쿠키로 토큰을 받아갈 수 있다(CSRF). 바디로 받은 토큰에는 이 문제가 없다 —
   * 그 값을 아는 것 자체가 자격이라 브라우저가 대신 붙여주지 않는다.
   */
  assertFirstPartyOrigin(origin?: string): void {
    if (origin && !isFirstPartyOrigin(origin, this.config.rootDomain)) {
      this.logger.debug(`Origin rejected: not first-party (origin=${origin})`);
      throw new ForbiddenError(AuthErrorCode.APP_ORIGIN_NOT_ALLOWED);
    }
  }

  /**
   * 토큰 교환 요청의 Origin 을 코드의 발급 대상과 대조하고, **그 클라이언트의 앱을 돌려준다.**
   *
   * Origin 이 없으면(서버-서버·네이티브·curl) 대조는 건너뛴다 — 브라우저 교차출처 위협이 아니고,
   * Origin 은 브라우저만 강제로 채우는 헤더라 없다고 의심할 근거가 없다. FirstPartyGuard 와 같은 규칙이다.
   * 그 경우에도 **앱은 알아내야 한다** — 세션에 남길 값이라 검사 여부와 무관하다.
   *
   * @returns 이 코드를 받은 앱(App.id). 1st-party 면 null.
   */
  private async resolveExchangeClient(
    clientId: string | null,
    origin?: string,
  ): Promise<number | null> {
    if (!clientId) {
      // 1st-party: 등록된 클라이언트가 없으므로 서비스 루트 도메인으로만 판별한다.
      if (origin && !isFirstPartyOrigin(origin, this.config.rootDomain)) {
        this.logger.debug(`Token exchange rejected: not first-party (origin=${origin})`);
        throw new ForbiddenError(AuthErrorCode.APP_ORIGIN_NOT_ALLOWED);
      }
      return null;
    }
    const client = await this.access.getClient(clientId);
    if (!client || client.status !== AppStatus.ACTIVE) {
      this.logger.debug(
        `Token exchange rejected: unknown or inactive client (clientId=${clientId} origin=${origin ?? '-'})`,
      );
      throw new ForbiddenError(AuthErrorCode.APP_ORIGIN_NOT_ALLOWED);
    }
    const origins = (client.origins as string[] | null) ?? [];
    if (origin && !origins.includes(origin)) {
      this.logger.debug(
        `Token exchange rejected: origin not registered (clientId=${clientId} origin=${origin})`,
      );
      throw new ForbiddenError(AuthErrorCode.APP_ORIGIN_NOT_ALLOWED);
    }
    return client.appId;
  }

  /**
   * grant_type=authorization_code. 릴레이 인가코드 → 세션·토큰 발급.
   *
   * **오리진 검사를 코드에 박힌 clientId 기준으로 한다.** 요청이 스스로 신고한 값이 아니라
   * 발급 시점에 서버가 정한 값이라 위조할 수 없다.
   *
   * 검사 실패해도 코드는 이미 소비된 상태다(consume 이 먼저다). 의도한 동작이다 —
   * 잘못된 출처에서 한 번이라도 시도된 코드는 다시 못 쓰는 게 맞다.
   */
  async exchangeAuthorizationCode(
    code: string,
    meta: RequestMeta,
    requestOrigin?: string,
    codeVerifier?: string,
  ): Promise<AuthTokens> {
    const { userId, clientId, codeChallenge, provider, persistent } =
      await this.tokens.consumeAuthCode(code);
    assertCodeVerifier(codeChallenge, codeVerifier);
    // 검사와 함께 **어느 앱의 코드였는지**를 받아 세션에 남긴다(토큰의 app 클레임이 된다).
    const appId = await this.resolveExchangeClient(clientId, requestOrigin);
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError(AuthErrorCode.AUTH_ACCOUNT_DISABLED);
    }
    // **가입 방식(joinType)이 아니라 이번에 쓴 수단을 남긴다.** 콜백이 코드에 실어 보낸다.
    // 이메일 로그인처럼 코드에 provider 가 없는 경로(1st-party 릴레이)는 joinType 으로 떨어진다.
    // **"로그인 상태 유지" 는 코드에서 온다.** 이 요청은 그 앱의 서버 대 서버 교환이라
    // 사용자의 선택을 물어볼 화면이 없다 — 콜백이 코드에 실어 보낸 값을 그대로 쓴다.
    return this.login.complete(user, provider ?? user.joinType, meta, persistent, appId);
  }

  /** grant_type=refresh_token. rotate 후 새 access/refresh 발급(refresh 는 로그 대상 아님 — 폭증 방지). */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      // 탈퇴·정지 계정의 잔존 세션은 즉시 폐기한다.
      await this.tokens.revokeSession(rotated.userId, rotated.sessionId);
      throw new UnauthorizedError(AuthErrorCode.AUTH_ACCOUNT_DISABLED);
    }
    return this.tokens.buildTokens(user.id, user.role, rotated);
  }

  /** 로그아웃: 현재 세션 폐기. */
  async logout(sessionId: number, userId: number, meta: RequestMeta): Promise<void> {
    await this.tokens.revokeSession(userId, sessionId);
    await this.log.record({
      userId,
      action: AuthLogAction.LOGOUT,
      result: AuthLogResult.SUCCESS,
      sessionId,
      ...meta,
    });
  }

  /**
   * refresh 쿠키만으로 로그아웃한다. **아무 자격증명도 요구하지 않는다.**
   *
   * 로그아웃은 "잊는" 동작이다. 인증을 걸면 access token 이 만료됐을 때 거절당하고, 그
   * 응답에는 쿠키 삭제도 실리지 않아 **세션이 살아남는다** — 정확히 그래서 로그아웃이
   * 안 되는 일이 있었다. 지울 것이 없으면 없는 대로 끝내고, 쿠키는 항상 지운다.
   *
   * 폐기할 세션을 찾았을 때만 감사 로그를 남긴다(남길 userId 가 그때 생긴다).
   */
  async logoutByRefreshToken(refreshToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!refreshToken) return;
    const revoked = await this.tokens.revokeByRefreshToken(refreshToken);
    if (!revoked) return;
    await this.log.record({
      userId: revoked.userId,
      action: AuthLogAction.LOGOUT,
      result: AuthLogResult.SUCCESS,
      sessionId: revoked.sessionId,
      ...meta,
    });
  }
}

/** PKCE code_challenge 로 허용하는 길이(RFC 7636 은 verifier 43~128자, S256 결과는 43자). */
const CHALLENGE_LENGTH = 43;

/**
 * 발급 요청의 code_challenge 를 검증한다. **없으면 거부한다.**
 *
 * 선택 사항으로 두면 "challenge 를 빼고 요청해서 검증을 건너뛰는" 우회로가 생긴다(downgrade).
 * S256 만 받는다 — plain 은 challenge 가 곧 verifier 라 아무 보호가 안 된다(RFC 7636 §7.2).
 */
function assertCodeChallenge(value?: string): string {
  const challenge = value?.trim();
  if (!challenge) {
    throw new BadRequestError(AuthErrorCode.OAUTH_INVALID_GRANT, {
      message: 'code_challenge is required (PKCE, S256).',
    });
  }
  // S256 결과는 base64url 43자로 길이가 고정이다. 형식이 어긋나면 클라이언트 구현 오류다.
  if (challenge.length !== CHALLENGE_LENGTH || !/^[A-Za-z0-9\-_]+$/.test(challenge)) {
    throw new BadRequestError(AuthErrorCode.OAUTH_INVALID_GRANT, {
      message: 'code_challenge must be BASE64URL(SHA256(code_verifier)).',
    });
  }
  return challenge;
}

/**
 * 교환 요청의 code_verifier 를 코드에 박힌 challenge 와 대조한다.
 *
 * challenge 가 없는 코드(마이그레이션 이전 발급분)는 검증을 건너뛰지 않고 **거부한다** —
 * 건너뛰면 그게 곧 우회로다. 인가코드 수명이 30초라 실제로 걸릴 코드는 없다.
 */
function assertCodeVerifier(challenge: string | null, verifier?: string): void {
  if (!challenge) {
    throw new UnauthorizedError(AuthErrorCode.OAUTH_INVALID_GRANT);
  }
  const value = verifier?.trim();
  if (!value) {
    throw new BadRequestError(AuthErrorCode.OAUTH_INVALID_GRANT, {
      message: 'code_verifier is required (PKCE).',
    });
  }
  // 양쪽을 한 번 더 hex 로 해싱해 길이를 고정한 뒤 상수시간 비교한다.
  // 그냥 비교하면 길이가 다를 때 즉시 false 라, 길이 정보가 타이밍으로 샌다.
  const expected = sha256hex(challenge);
  const actual = sha256hex(sha256base64url(value));
  if (!timingSafeEqualHex(expected, actual)) {
    throw new UnauthorizedError(AuthErrorCode.OAUTH_INVALID_GRANT, {
      message: 'code_verifier mismatch.',
    });
  }
}
