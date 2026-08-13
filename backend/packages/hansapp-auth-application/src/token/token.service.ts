import { randomInt } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthProvider, UserRole } from '@hansapp/data';
import {
  composeSignedToken,
  hmacSha256hex,
  parseSignedToken,
  randomToken,
  sha256hex,
  timingSafeEqualHex,
} from '@hansapp/common';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { AccessTokenPayload } from '../guard/auth-user';
import { AuthCodeRepository } from '../repository/auth-code.repository';
import { TokenSessionRepository } from '../repository/token-session.repository';
import { SessionCache } from '../session-cache.service';
import { JwtKeyService } from './jwt-key.service';

/** refresh token 접두사 */
const REFRESH_PREFIX = 'rt_';

/**
 * refresh 토큰이 싣는 식별자 조각 수: `<회원번호>.<세션식별자>`.
 *
 * **회원번호를 함께 싣는다.** 세션을 (회원, 세션) 쌍으로 찾기 위해서다 — 캐시 키도 같은
 * 규칙으로 묶여 있어, 식별자 하나만 아는 것으로는 어느 계정도 가리킬 수 없다.
 */
const REFRESH_ID_PARTS = 2;

/** 토큰이 실어 온 회원번호. 숫자가 아니면 조작이므로 없는 회원(0)으로 떨어뜨린다. */
function ownerOf(ids: string[]): number {
  return positiveIntOf(ids[0]);
}

/** 토큰이 실어 온 세션 식별자. 위와 같은 규칙이다. */
function sessionIdOf(ids: string[]): number {
  return positiveIntOf(ids[1]);
}

function positiveIntOf(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * 세션 식별자. **회원 안에서만 유일하면 된다**(키가 복합키다).
 *
 * MySQL INT 상한 안에서 뽑는다 — 계정당 세션이 열 개 남짓이라 이 공간이면 겹칠 일이 없고,
 * 겹치더라도 create 가 키 충돌로 떨어져 조용히 덮어쓰는 일은 없다.
 */
function randomSessionId(): number {
  return randomInt(1, 2_147_483_647);
}
/** 인가코드(릴레이) 접두사 */
const AUTH_CODE_PREFIX = 'ac_';

/** 세션 발급/갱신 결과. access token 은 호출측이 issueAccessToken 으로 별도 발급한다. */
export interface IssuedSession {
  readonly sessionId: number;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  /** "로그인 상태 유지" 선택. 쿠키를 영속으로 심을지 정한다. */
  readonly persistent: boolean;
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
  /**
   * "로그인 상태 유지" 선택. **쿠키를 심는 쪽(respondTokens)이 이 값으로 만료를 정한다.**
   * 켜면 만료 시각이 박힌 영속 쿠키, 끄면 브라우저를 닫을 때 사라지는 세션 쿠키다.
   */
  readonly persistent: boolean;

  /**
   * 이번 로그인의 세션 식별자.
   *
   * **응답으로 나가지 않는다** — respondTokens 가 담을 필드를 명시적으로 고른다.
   * 로그인 이벤트를 발행할 때 "이번에 만든 세션" 을 가리키는 데 쓴다(비밀값도 아니다 —
   * access token 에 sid 로 이미 들어 있다).
   */
  readonly sessionId: number;
}

/** 소비된 인가코드의 내용. clientId 가 null 이면 1st-party(hansapp-web) 발급이다. */
export interface ConsumedAuthCode {
  readonly userId: number;
  readonly clientId: string | null;
  /** PKCE code_challenge(S256). 호출측이 code_verifier 와 대조한다. */
  readonly codeChallenge: string | null;
  /** 이번 로그인에 쓴 수단. 로그인 로그에 그대로 쓴다(가입 방식이 아니다). */
  readonly provider: AuthProvider | null;
  /** 시작 화면에서 고른 "로그인 상태 유지". 이 값으로 세션과 쿠키의 수명이 갈린다. */
  readonly persistent: boolean;
}

/**
 * 토큰 발급·검증·저장의 중심.
 * - access token: JWT(HS256), stateless. 서명·만료만으로 검증한다.
 * - refresh token: 불투명 토큰. 서버는 secret 해시만 저장하고 rotate 시 교체·만료 연장(sliding).
 * - 인가코드: 소셜 콜백→프론트 릴레이용 1회용 코드.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  /**
   * 토큰 HMAC 사전검증용 키. jwtSecret 에서 **토큰 종류별로 도메인 분리해** 파생한다
   * (별도 env 불필요, JWT 서명키와 용도 분리). 태그는 보안 경계가 아니라 DB 조회 전 값싼 관문이다.
   */
  private readonly authCodeTagKey: string;
  private readonly refreshTagKey: string;

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly accessKeys: JwtKeyService,
    private readonly sessions: TokenSessionRepository,
    private readonly sessionCache: SessionCache,
    private readonly authCodes: AuthCodeRepository,
  ) {
    this.authCodeTagKey = hmacSha256hex(config.jwtSecret, 'auth-code-tag-v1');
    this.refreshTagKey = hmacSha256hex(config.jwtSecret, 'refresh-token-tag-v1');
  }

  // ---- access token (JWT) ----

  issueAccessToken(userId: number, role: UserRole, sessionId: number): string {
    const payload: AccessTokenPayload = {
      sub: String(userId),
      role,
      sid: sessionId,
    };
    return this.accessKeys.sign(payload);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.accessKeys.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
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
    persistent = true,
  ): Promise<IssuedSession> {
    /*
      **세션 식별자는 난수 숫자다.** 이 값 자체는 비밀이 아니다 — refresh 는 secret 이,
      access 는 서명이 지키고, 조회·캐시는 모두 (회원, 세션) 쌍으로 묶여 있다. 그래서
      길 필요가 없고, 콘솔·로그에서 눈으로 다루기 좋은 모양이면 된다.

      **순번이 아니라 난수인 이유.** 순번은 그 회원의 발급량을 드러내고, 옆 번호를 짚어
      보게 한다. 키가 (회원, 세션) 복합키라 회원 안에서만 유일하면 된다 — 계정당 세션이
      열 개 남짓이라 32비트 난수로도 겹칠 일이 없다.
    */
    const sessionId = randomSessionId();
    const secret = randomToken(24);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSec * 1000);
    await this.sessions.create({
      sessionId,
      userId,
      secretHash: sha256hex(secret),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
      persistent,
    });
    // 발급 확인용 로그. ip 는 resolveClientIp 로 통일된 값이라, CDN/프록시 뒤에서 진짜 클라 IP 가
    // 제대로 잡히는지 이 로그로 검증할 수 있다.
    this.logger.log(`refresh issued: userId=${userId} sid=${sessionId} ip=${meta.ip ?? '-'}`);
    return {
      sessionId,
      refreshToken:
        REFRESH_PREFIX +
        composeSignedToken([String(userId), String(sessionId)], secret, this.refreshTagKey),
      expiresAt,
      persistent,
    };
  }

  /**
   * refresh token 을 검증하고 secret 을 교체(rotate)하며 만료를 연장한다(sliding).
   * 형식 오류·미존재·만료·secret 불일치는 모두 401.
   */
  async rotateRefreshToken(refreshToken: string): Promise<RotatedSession> {
    // HMAC 태그부터 검증한다. 위조·변조·정크 토큰은 여기서 DB 조회 없이 탈락한다(저사양 보호).
    const parsed = parseSignedToken(
      refreshToken,
      REFRESH_PREFIX,
      this.refreshTagKey,
      REFRESH_ID_PARTS,
    );
    if (!parsed) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    /*
      **(회원, 세션) 쌍으로 찾는다.** 세션 식별자 하나로 찾던 것을 바꾼 이유는, 그러면
      식별자를 아는 것만으로 어느 계정의 세션이든 가리킬 수 있기 때문이다 — 캐시 키도
      같은 규칙으로 회원과 묶여 있다. 짝이 맞지 않으면 없는 것으로 본다.
    */
    const session = await this.sessions.findOwned(ownerOf(parsed.ids), sessionIdOf(parsed.ids));
    if (!session) {
      throw new UnauthorizedException('Session not found.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete(session.userId, session.sessionId);
      await this.sessionCache.invalidate(session.userId, [session.sessionId]);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    if (!timingSafeEqualHex(session.secretHash, sha256hex(parsed.secret))) {
      throw new UnauthorizedException('Refresh token mismatch.');
    }

    const newSecret = randomToken(24);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSec * 1000);
    await this.sessions.rotate(session.userId, session.sessionId, sha256hex(newSecret), expiresAt);
    // 갱신(rotate)도 refresh 를 재발급한다. rotate 경로엔 요청 meta 가 없어 IP 는 남기지 않는다.
    this.logger.log(`refresh rotated: userId=${session.userId} sid=${session.sessionId}`);
    return {
      userId: session.userId,
      sessionId: session.sessionId,
      refreshToken:
        REFRESH_PREFIX +
        composeSignedToken(
          [String(session.userId), String(session.sessionId)],
          newSecret,
          this.refreshTagKey,
        ),
      expiresAt,
      // 갱신해도 처음 선택을 그대로 이어 간다(요청만 보고는 알 수 없다).
      persistent: session.persistent,
    };
  }

  /** 세션을 새로 만들고 access token 까지 조립해 로그인 응답 토큰을 반환한다. */
  async issueLogin(
    userId: number,
    role: UserRole,
    meta: { userAgent?: string | null; ip?: string | null },
    persistent = true,
  ): Promise<AuthTokens> {
    const session = await this.createSession(userId, meta, persistent);
    return this.buildTokens(userId, role, session);
  }

  /** 세션(신규/rotate)에 access token 을 얹어 토큰 묶음을 만든다. */
  buildTokens(userId: number, role: UserRole, session: IssuedSession): AuthTokens {
    return {
      accessToken: this.issueAccessToken(userId, role, session.sessionId),
      tokenType: 'Bearer',
      expiresIn: this.config.accessTokenTtlSec,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
      persistent: session.persistent,
      sessionId: session.sessionId,
    };
  }

  /**
   * refresh token 이 가리키는 세션을 폐기한다. **로그아웃 전용 — 실패해도 던지지 않는다.**
   *
   * 로그아웃은 "잊는" 동작이라 검증에 실패했다고 거절하면 안 된다. 토큰이 깨졌거나 이미
   * 없는 세션이면 지울 것이 없을 뿐이고, 호출자는 어차피 쿠키를 지운다.
   *
   * @returns 실제로 폐기한 세션. 없었으면 null(감사 로그를 남길 대상도 없다).
   */
  async revokeByRefreshToken(
    refreshToken: string,
  ): Promise<{ sessionId: number; userId: number } | null> {
    const parsed = parseSignedToken(
      refreshToken,
      REFRESH_PREFIX,
      this.refreshTagKey,
      REFRESH_ID_PARTS,
    );
    if (!parsed) return null;
    const session = await this.sessions.findOwned(ownerOf(parsed.ids), sessionIdOf(parsed.ids));
    if (!session) return null;
    // secret 까지 맞아야 남의 세션을 못 지운다. 만료 여부는 안 본다 — 만료된 세션도 치운다.
    if (!timingSafeEqualHex(session.secretHash, sha256hex(parsed.secret))) {
      return null;
    }
    await this.sessions.delete(session.userId, session.sessionId);
    await this.sessionCache.invalidate(session.userId, [session.sessionId]);
    return { sessionId: session.sessionId, userId: session.userId };
  }

  /** 세션 하나를 폐기한다. **캐시 키가 회원번호와 묶여 있어 userId 를 함께 받는다.** */
  async revokeSession(userId: number, sessionId: number): Promise<void> {
    await this.sessions.delete(userId, sessionId);
    // 지운 뒤 캐시를 비운다. 안 비우면 그 토큰이 캐시 TTL 만큼 더 통한다.
    await this.sessionCache.invalidate(userId, [sessionId]);
  }

  async revokeAllSessions(userId: number): Promise<number> {
    const removed = await this.sessions.deleteAllByUser(userId);
    await this.sessionCache.invalidate(userId, removed);
    return removed.length;
  }

  // ---- 인가코드(릴레이) ----

  /**
   * 소셜 콜백에서 프론트로 넘길 1회용 인가코드를 발급한다.
   *
   * clientId 는 **발급 시점에 서버가 정해 코드에 박는다**(요청이 나중에 주장하는 값이 아니다).
   * 교환 때 이 값으로 요청 Origin 을 대조하므로, 코드가 새어도 다른 출처에서는 못 쓴다.
   * null 이면 1st-party(hansapp-web) 발급이다.
   */
  async issueAuthCode(
    userId: number,
    clientId: string | null = null,
    codeChallenge: string | null = null,
    provider: AuthProvider | null = null,
    persistent = false,
  ): Promise<string> {
    const sid = randomToken(12);
    const secret = randomToken(24);
    await this.authCodes.create({
      sid,
      userId,
      clientId,
      codeChallenge,
      provider,
      persistent,
      secretHash: sha256hex(secret),
      expiresAt: new Date(Date.now() + this.config.authCodeTtlSec * 1000),
    });
    return AUTH_CODE_PREFIX + composeSignedToken(sid, secret, this.authCodeTagKey);
  }

  /**
   * 인가코드를 소비하고 **회원번호와 발급 대상 클라이언트**를 반환한다(1회용).
   * 형식 오류·미존재·만료·이미 소비·secret 불일치는 401.
   *
   * clientId 를 같이 주는 이유: 호출측이 이 값으로 요청 Origin 을 대조해야 하기 때문이다.
   */
  async consumeAuthCode(code: string): Promise<ConsumedAuthCode> {
    // HMAC 태그부터 검증한다. 위조·변조·정크 코드는 여기서 DB 조회 없이 탈락한다(저사양 보호).
    const parsed = parseSignedToken(code, AUTH_CODE_PREFIX, this.authCodeTagKey);
    if (!parsed) {
      throw new UnauthorizedException('Invalid authorization code.');
    }
    const row = await this.authCodes.findById(parsed.ids[0]);
    if (!row || row.consumedAt) {
      throw new UnauthorizedException('Authorization code is not usable.');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Authorization code expired.');
    }
    if (!timingSafeEqualHex(row.secretHash, sha256hex(parsed.secret))) {
      throw new UnauthorizedException('Authorization code mismatch.');
    }
    // 원자적 1회 소비: 아직 소비되지 않은 건만 마킹. 경쟁 시 count=0 이면 거부.
    const consumed = await this.authCodes.consume(row.sid, new Date());
    if (consumed === 0) {
      throw new UnauthorizedException('Authorization code already used.');
    }
    return {
      userId: row.userId,
      clientId: row.clientId,
      codeChallenge: row.codeChallenge,
      provider: row.provider,
      persistent: row.persistent,
    };
  }
}
