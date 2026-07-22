import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@hansapi/data';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { AccessTokenPayload } from '../guard/auth-user';
import { AuthCodeRepository } from '../repository/auth-code.repository';
import { TokenSessionRepository } from '../repository/token-session.repository';
import {
  composeToken,
  parseToken,
  randomToken,
  sha256hex,
  timingSafeEqualHex,
} from './crypto.util';

/** refresh token 접두사 */
const REFRESH_PREFIX = 'rt_';
/** 인가코드(릴레이) 접두사 */
const AUTH_CODE_PREFIX = 'ac_';

/** 세션 발급/갱신 결과. access token 은 호출측이 issueAccessToken 으로 별도 발급한다. */
export interface IssuedSession {
  readonly sessionId: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

/** refresh 검증·rotate 결과. */
export interface RotatedSession extends IssuedSession {
  readonly userId: number;
}

/** 로그인/갱신 응답으로 내려가는 토큰 묶음. */
export interface AuthTokens {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  /** access token 만료(초) */
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

/**
 * 토큰 발급·검증·저장의 중심.
 * - access token: JWT(HS256), stateless. 서명·만료만으로 검증한다.
 * - refresh token: 불투명 토큰. 서버는 secret 해시만 저장하고 rotate 시 교체·만료 연장(sliding).
 * - 인가코드: 소셜 콜백→프론트 릴레이용 1회용 코드.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly jwt: JwtService,
    private readonly sessions: TokenSessionRepository,
    private readonly authCodes: AuthCodeRepository,
  ) {}

  // ---- access token (JWT) ----

  issueAccessToken(userId: number, role: UserRole, sessionId: string): string {
    const payload: AccessTokenPayload = {
      sub: String(userId),
      role,
      sid: sessionId,
    };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
    }
  }

  get accessTokenTtlSec(): number {
    return this.config.accessTokenTtlSec;
  }

  // ---- refresh 세션 ----

  /** 새 refresh 세션을 만들고 refresh token 을 반환한다. */
  async createSession(
    userId: number,
    meta: { userAgent?: string | null; ip?: string | null },
  ): Promise<IssuedSession> {
    const sessionId = randomToken(18);
    const secret = randomToken(24);
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlSec * 1000,
    );
    await this.sessions.create({
      sessionId,
      userId,
      secretHash: sha256hex(secret),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    });
    return {
      sessionId,
      refreshToken: REFRESH_PREFIX + composeToken(sessionId, secret),
      expiresAt,
    };
  }

  /**
   * refresh token 을 검증하고 secret 을 교체(rotate)하며 만료를 연장한다(sliding).
   * 형식 오류·미존재·만료·secret 불일치는 모두 401.
   */
  async rotateRefreshToken(refreshToken: string): Promise<RotatedSession> {
    const parsed = parseToken(refreshToken, REFRESH_PREFIX);
    if (!parsed) {
      throw new UnauthorizedException('유효하지 않은 refresh token 입니다.');
    }
    const session = await this.sessions.findById(parsed.id);
    if (!session) {
      throw new UnauthorizedException('세션을 찾을 수 없습니다.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete(session.sessionId);
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인하세요.',
      );
    }
    if (!timingSafeEqualHex(session.secretHash, sha256hex(parsed.secret))) {
      throw new UnauthorizedException('refresh token 이 일치하지 않습니다.');
    }

    const newSecret = randomToken(24);
    const expiresAt = new Date(
      Date.now() + this.config.refreshTokenTtlSec * 1000,
    );
    await this.sessions.rotate(
      session.sessionId,
      sha256hex(newSecret),
      expiresAt,
    );
    return {
      userId: session.userId,
      sessionId: session.sessionId,
      refreshToken: REFRESH_PREFIX + composeToken(session.sessionId, newSecret),
      expiresAt,
    };
  }

  /** 세션을 새로 만들고 access token 까지 조립해 로그인 응답 토큰을 반환한다. */
  async issueLogin(
    userId: number,
    role: UserRole,
    meta: { userAgent?: string | null; ip?: string | null },
  ): Promise<AuthTokens> {
    const session = await this.createSession(userId, meta);
    return this.buildTokens(userId, role, session);
  }

  /** 세션(신규/rotate)에 access token 을 얹어 토큰 묶음을 만든다. */
  buildTokens(
    userId: number,
    role: UserRole,
    session: IssuedSession,
  ): AuthTokens {
    return {
      accessToken: this.issueAccessToken(userId, role, session.sessionId),
      tokenType: 'Bearer',
      expiresIn: this.config.accessTokenTtlSec,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  revokeSession(sessionId: string): Promise<void> {
    return this.sessions.delete(sessionId);
  }

  revokeAllSessions(userId: number): Promise<number> {
    return this.sessions.deleteAllByUser(userId);
  }

  // ---- 인가코드(릴레이) ----

  /** 소셜 콜백에서 프론트로 넘길 1회용 인가코드를 발급한다. */
  async issueAuthCode(userId: number): Promise<string> {
    const sid = randomToken(12);
    const secret = randomToken(24);
    await this.authCodes.create({
      sid,
      userId,
      secretHash: sha256hex(secret),
      expiresAt: new Date(Date.now() + this.config.authCodeTtlSec * 1000),
    });
    return AUTH_CODE_PREFIX + composeToken(sid, secret);
  }

  /**
   * 인가코드를 소비하고 회원번호를 반환한다(1회용).
   * 형식 오류·미존재·만료·이미 소비·secret 불일치는 401.
   */
  async consumeAuthCode(code: string): Promise<number> {
    const parsed = parseToken(code, AUTH_CODE_PREFIX);
    if (!parsed) {
      throw new UnauthorizedException('유효하지 않은 인가코드입니다.');
    }
    const row = await this.authCodes.findById(parsed.id);
    if (!row || row.consumedAt) {
      throw new UnauthorizedException('사용할 수 없는 인가코드입니다.');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('인가코드가 만료되었습니다.');
    }
    if (!timingSafeEqualHex(row.secretHash, sha256hex(parsed.secret))) {
      throw new UnauthorizedException('인가코드가 일치하지 않습니다.');
    }
    // 원자적 1회 소비: 아직 소비되지 않은 건만 마킹. 경쟁 시 count=0 이면 거부.
    const consumed = await this.authCodes.consume(row.sid, new Date());
    if (consumed === 0) {
      throw new UnauthorizedException('이미 사용된 인가코드입니다.');
    }
    return row.userId;
  }
}
