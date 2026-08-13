import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  composeSignedToken,
  hmacSha256hex,
  parseSignedToken,
  randomToken,
  sha256hex,
  timingSafeEqualHex,
} from '@hansapp/common';

import { ADMIN_AUTH_CONFIG } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import type { AdminAccessTokenPayload } from './admin-auth-user';
import { AdminJwtService } from './admin-jwt.service';
import { AdminSessionRepository } from './admin-session.repository';

/**
 * 관리자 refresh token 접두사.
 *
 * 공개 API 는 `rt_` 를 쓴다. 한 글자 다른 게 아니라 아예 갈라 두면 로그·DB 를 볼 때
 * 어느 계층의 토큰인지 눈으로 바로 갈린다.
 */
const ADMIN_REFRESH_PREFIX = 'art_';

/** 세션 발급/갱신 결과. access token 은 호출측이 따로 얹는다. */
export interface IssuedAdminSession {
  readonly sessionId: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

export interface RotatedAdminSession extends IssuedAdminSession {
  readonly adminId: number;
}

/** 로그인/갱신 응답으로 내려가는 토큰 묶음. */
export interface AdminAuthTokens {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  /** access token 만료(초) */
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  /**
   * 이번 로그인의 세션 식별자.
   *
   * **응답으로 나가지 않는다** — 응답에 담을 필드는 컨트롤러가 명시적으로 고른다.
   * 감사 로그가 "이번에 만든 세션" 을 가리키는 데 쓴다(비밀값도 아니다 — access token 에
   * sid 로 이미 들어 있다).
   */
  readonly sessionId: string;
  /** 비밀번호를 바꾸기 전까지 다른 API 가 막혀 있는가. 프론트가 변경 화면으로 보낼 때 쓴다. */
  readonly mustChangePassword: boolean;
}

/** 세션 기록용 요청 부가정보. */
export interface AdminRequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/**
 * 관리자 토큰 발급·검증·저장.
 * - access token: JWT(HS256), stateless. 서명·만료만으로 검증한다.
 * - refresh token: 불투명 토큰. 서버는 secret 해시만 저장하고 rotate 시 교체·만료 연장(sliding).
 */
@Injectable()
export class AdminTokenService {
  private readonly logger = new Logger(AdminTokenService.name);

  /**
   * refresh token HMAC 사전검증용 키. jwtSecret 에서 **도메인 문자열로 갈라** 파생한다.
   *
   * 공개 API 는 `'refresh-token-tag-v1'` 을 쓴다. 태그는 보안 경계가 아니라 DB 조회 전
   * 값싼 관문이지만, 문자열을 갈라 두면 시크릿이 같아지는 사고가 나도 태그 단계에서 먼저 걸린다.
   */
  private readonly refreshTagKey: string;

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    private readonly jwt: AdminJwtService,
    private readonly sessions: AdminSessionRepository,
  ) {
    this.refreshTagKey = hmacSha256hex(config.jwtSecret, 'admin-refresh-token-tag-v1');
  }

  // ---- access token (JWT) ----

  issueAccessToken(adminId: number, sessionId: string, mustChangePassword = false): string {
    const payload: AdminAccessTokenPayload = {
      sub: String(adminId),
      sid: sessionId,
      // 필요할 때만 싣는다. 평상시 토큰에 `chg: false` 를 넣어 봐야 길이만 늘어난다.
      ...(mustChangePassword ? { chg: true } : {}),
    };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): AdminAccessTokenPayload {
    return this.jwt.verify<AdminAccessTokenPayload>(token);
  }

  get accessTokenTtlSec(): number {
    return this.config.accessTokenTtlSec;
  }

  // ---- refresh 세션 ----

  /** 새 refresh 세션을 만들고 refresh token 을 반환한다. */
  async createSession(adminId: number, meta: AdminRequestMeta): Promise<IssuedAdminSession> {
    const sessionId = randomToken(18);
    const secret = randomToken(24);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSec * 1000);
    await this.sessions.create({
      sessionId,
      adminId,
      secretHash: sha256hex(secret),
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt,
    });
    this.logger.log(
      `admin refresh issued: adminId=${adminId} sid=${sessionId} ip=${meta.ip ?? '-'}`,
    );
    return {
      sessionId,
      refreshToken:
        ADMIN_REFRESH_PREFIX + composeSignedToken(sessionId, secret, this.refreshTagKey),
      expiresAt,
    };
  }

  /**
   * refresh token 을 검증하고 secret 을 교체(rotate)하며 만료를 연장한다(sliding).
   * 형식 오류·미존재·만료·secret 불일치는 모두 401.
   */
  async rotateRefreshToken(refreshToken: string): Promise<RotatedAdminSession> {
    // HMAC 태그부터 본다. 위조·변조·정크 토큰은 여기서 DB 조회 없이 탈락한다.
    const parsed = parseSignedToken(refreshToken, ADMIN_REFRESH_PREFIX, this.refreshTagKey);
    if (!parsed) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    const session = await this.sessions.findById(parsed.id);
    if (!session) {
      throw new UnauthorizedException('Session not found.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete(session.sessionId);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    if (!timingSafeEqualHex(session.secretHash, sha256hex(parsed.secret))) {
      throw new UnauthorizedException('Refresh token mismatch.');
    }

    const newSecret = randomToken(24);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSec * 1000);
    await this.sessions.rotate(session.sessionId, sha256hex(newSecret), expiresAt);
    return {
      adminId: session.adminId,
      sessionId: session.sessionId,
      refreshToken:
        ADMIN_REFRESH_PREFIX + composeSignedToken(session.sessionId, newSecret, this.refreshTagKey),
      expiresAt,
    };
  }

  /**
   * 세션(신규/rotate)에 access token 을 얹어 토큰 묶음을 만든다.
   *
   * `mustChangePassword` 는 **호출측이 DB 에서 읽어 넘긴다** — 로그인·갱신 둘 다 그 시점에
   * 계정을 조회하므로, 여기서 또 읽으면 같은 행을 두 번 보는 셈이다.
   */
  buildTokens(
    adminId: number,
    session: IssuedAdminSession,
    mustChangePassword = false,
  ): AdminAuthTokens {
    return {
      accessToken: this.issueAccessToken(adminId, session.sessionId, mustChangePassword),
      tokenType: 'Bearer',
      expiresIn: this.config.accessTokenTtlSec,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
      sessionId: session.sessionId,
      mustChangePassword,
    };
  }

  /**
   * refresh token 이 가리키는 세션을 폐기한다. **로그아웃 전용 — 실패해도 던지지 않는다.**
   *
   * 로그아웃은 "잊는" 동작이라 검증에 실패했다고 거절하면 안 된다. 토큰이 깨졌거나 이미
   * 없는 세션이면 지울 것이 없을 뿐이고, 호출자는 어차피 쿠키를 지운다.
   *
   * @returns 실제로 폐기한 세션. 없었으면 null.
   */
  async revokeByRefreshToken(
    refreshToken: string,
  ): Promise<{ sessionId: string; adminId: number } | null> {
    const parsed = parseSignedToken(refreshToken, ADMIN_REFRESH_PREFIX, this.refreshTagKey);
    if (!parsed) return null;
    const session = await this.sessions.findById(parsed.id);
    if (!session) return null;
    // secret 까지 맞아야 남의 세션을 못 지운다. 만료 여부는 안 본다 — 만료된 세션도 치운다.
    if (!timingSafeEqualHex(session.secretHash, sha256hex(parsed.secret))) {
      return null;
    }
    await this.sessions.delete(session.sessionId);
    return { sessionId: session.sessionId, adminId: session.adminId };
  }

  revokeSession(sessionId: string): Promise<void> {
    return this.sessions.delete(sessionId);
  }

  revokeAllByAdmin(adminId: number): Promise<number> {
    return this.sessions.deleteAllByAdmin(adminId);
  }

  /** 세션 수 상한을 넘으면 오래된 것부터 정리한다. 0 이하 설정이면 끈 것으로 본다. */
  async trimSessions(adminId: number): Promise<void> {
    const keep = this.config.maxSessionsPerAdmin;
    if (keep <= 0) return;
    const removed = await this.sessions.trimToLimit(adminId, keep);
    if (removed > 0) {
      this.logger.log(
        `admin session trimmed: adminId=${adminId} removed=${removed} (limit ${keep})`,
      );
    }
  }
}
