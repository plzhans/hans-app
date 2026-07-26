import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ActionResult, AppStatus, UserAction, UserStatus } from '@hansapi/data';

import { AccessCache } from './app/access-cache.service';
import {
  sha256base64url,
  sha256hex,
  timingSafeEqualHex,
} from './token/crypto.util';
import { AUTH_CONFIG } from './auth.config';
import type { AuthConfig } from './auth.config';
import { RequestMeta } from './auth.service';
import { ActionLogService } from './log/action-log.service';
import { UserRepository } from './repository/user.repository';
import { AuthTokens, TokenService } from './token/token.service';

/**
 * OAuth2 토큰 엔드포인트(/oauth/token)의 grant 처리.
 * - authorization_code: 소셜 콜백이 프론트로 넘긴 릴레이 인가코드를 토큰으로 교환한다.
 * - refresh_token: 불투명 refresh token 을 rotate 하고 새 토큰을 발급한다.
 */
@Injectable()
export class OAuthTokenService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
    private readonly log: ActionLogService,
    private readonly access: AccessCache,
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
  ): Promise<string> {
    // PKCE 는 **모든 인가코드에 필수**다. 선택으로 두면 공격자가 challenge 를 빼고 요청해
    // 검증을 건너뛸 수 있다(downgrade). 예외를 두지 않아야 그 경로가 안 생긴다.
    const challenge = assertCodeChallenge(codeChallenge);

    let origin: string;
    try {
      origin = new URL(returnTo).origin;
    } catch {
      throw new BadRequestException('Malformed redirect_uri.');
    }

    // 외부 앱: 등록된 리디렉션 URI 와 **정확히** 일치해야 한다(OAuth 의 redirect_uri 규칙).
    // 오리진만 보면 같은 사이트의 아무 경로로나 코드를 흘릴 수 있다.
    if (clientId) {
      const client = await this.access.getClient(clientId);
      if (!client || client.status !== AppStatus.ACTIVE) {
        throw new BadRequestException('Unknown client.');
      }
      const allowed = (client.redirectUris as string[] | null) ?? [];
      if (!allowed.includes(returnTo)) {
        throw new BadRequestException(
          'redirect_uri is not a registered redirect URI.',
        );
      }
      return this.tokens.issueAuthCode(userId, client.clientId, challenge);
    }

    // 1st-party(hansapp-web): 자기 자신은 클라이언트로 등록하지 않으므로 전역 허용목록을 본다.
    if (!this.config.allowedOrigins.includes(origin)) {
      throw new BadRequestException('redirect_uri not allowed.');
    }
    return this.tokens.issueAuthCode(userId, null, challenge);
  }

  /**
   * **1st-party 전용 오리진 검사.** 쿠키를 자격증명으로 쓰는 경로가 호출한다.
   *
   * 쿠키는 브라우저가 교차출처 요청에도 자동으로 실어 보내므로, 오리진을 안 보면 아무 사이트나
   * 남의 쿠키로 토큰을 받아갈 수 있다(CSRF). 바디로 받은 토큰에는 이 문제가 없다 —
   * 그 값을 아는 것 자체가 자격이라 브라우저가 대신 붙여주지 않는다.
   */
  assertFirstPartyOrigin(origin?: string): void {
    if (origin && !this.config.allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Origin not allowed.');
    }
  }

  /**
   * 토큰 교환 요청의 Origin 을 코드의 발급 대상과 대조한다.
   *
   * Origin 이 없으면(서버-서버·네이티브·curl) 통과시킨다 — 브라우저 교차출처 위협이 아니고,
   * Origin 은 브라우저만 강제로 채우는 헤더라 없다고 의심할 근거가 없다. FirstPartyGuard 와 같은 규칙이다.
   */
  private async assertExchangeOrigin(
    clientId: string | null,
    origin?: string,
  ): Promise<void> {
    if (!origin) {
      return;
    }
    if (!clientId) {
      if (!this.config.allowedOrigins.includes(origin)) {
        throw new ForbiddenException('Origin not allowed.');
      }
      return;
    }
    const client = await this.access.getClient(clientId);
    const origins = (client?.origins as string[] | null) ?? [];
    if (
      !client ||
      client.status !== AppStatus.ACTIVE ||
      !origins.includes(origin)
    ) {
      throw new ForbiddenException('Origin not allowed.');
    }
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
    const { userId, clientId, codeChallenge } =
      await this.tokens.consumeAuthCode(code);
    assertCodeVerifier(codeChallenge, codeVerifier);
    await this.assertExchangeOrigin(clientId, requestOrigin);
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not available.');
    }
    const tokens = await this.tokens.issueLogin(user.id, user.role, meta);
    await this.log.record({
      userId: user.id,
      action: UserAction.LOGIN,
      result: ActionResult.SUCCESS,
      provider: user.joinType,
      ...meta,
    });
    return tokens;
  }

  /** grant_type=refresh_token. rotate 후 새 access/refresh 발급(refresh 는 로그 대상 아님 — 폭증 방지). */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      // 탈퇴·정지 계정의 잔존 세션은 즉시 폐기한다.
      await this.tokens.revokeSession(rotated.sessionId);
      throw new UnauthorizedException('Account is not available.');
    }
    return this.tokens.buildTokens(user.id, user.role, rotated);
  }

  /** 로그아웃: 현재 세션 폐기. */
  async logout(
    sessionId: string,
    userId: number,
    meta: RequestMeta,
  ): Promise<void> {
    await this.tokens.revokeSession(sessionId);
    await this.log.record({
      userId,
      action: UserAction.LOGOUT,
      result: ActionResult.SUCCESS,
      sessionId,
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
    throw new BadRequestException('code_challenge is required (PKCE, S256).');
  }
  // S256 결과는 base64url 43자로 길이가 고정이다. 형식이 어긋나면 클라이언트 구현 오류다.
  if (
    challenge.length !== CHALLENGE_LENGTH ||
    !/^[A-Za-z0-9\-_]+$/.test(challenge)
  ) {
    throw new BadRequestException(
      'code_challenge must be BASE64URL(SHA256(code_verifier)).',
    );
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
    throw new UnauthorizedException('Authorization code is not usable.');
  }
  const value = verifier?.trim();
  if (!value) {
    throw new BadRequestException('code_verifier is required (PKCE).');
  }
  // 양쪽을 한 번 더 hex 로 해싱해 길이를 고정한 뒤 상수시간 비교한다.
  // 그냥 비교하면 길이가 다를 때 즉시 false 라, 길이 정보가 타이밍으로 샌다.
  const expected = sha256hex(challenge);
  const actual = sha256hex(sha256base64url(value));
  if (!timingSafeEqualHex(expected, actual)) {
    throw new UnauthorizedException('code_verifier mismatch.');
  }
}
