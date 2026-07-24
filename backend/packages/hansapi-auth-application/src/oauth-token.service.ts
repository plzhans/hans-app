import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ActionResult, UserAction, UserStatus } from '@hansapi/data';

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
  ) {}

  /**
   * SSO 인가코드 발급. 로그인된 사용자가 다른 클라이언트로 로그인을 릴레이할 때,
   * return_to(허용목록 오리진)로 넘길 1회용 코드를 만든다.
   */
  async issueAuthorizationCode(
    userId: number,
    returnTo: string,
  ): Promise<string> {
    let origin: string;
    try {
      origin = new URL(returnTo).origin;
    } catch {
      throw new BadRequestException('return_to 형식이 올바르지 않습니다.');
    }
    if (!this.config.allowedOrigins.includes(origin)) {
      throw new BadRequestException('허용되지 않은 return_to 입니다.');
    }
    return this.tokens.issueAuthCode(userId);
  }

  /** grant_type=authorization_code. 릴레이 인가코드 → 세션·토큰 발급. */
  async exchangeAuthorizationCode(
    code: string,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const userId = await this.tokens.consumeAuthCode(code);
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
