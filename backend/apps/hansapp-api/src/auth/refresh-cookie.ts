import type { Request, Response } from 'express';
import type { AuthTokens, RequestMeta } from '@hansapp/auth-application';

import type { ConfigSource } from '@hansapp/common';

import { resolveClientIp } from '../common/client-ip';

import type { TokenResponseDto } from './dto/auth.dto';

/**
 * refresh token 은 httpOnly 쿠키로만 오간다(자바스크립트 접근 차단, XSS 시 탈취 방지).
 * access token 은 응답 바디로 내려가 프론트 메모리에 보관한다.
 */
export const REFRESH_COOKIE = 'refresh_token';

// 로그인 힌트 쿠키. **non-httpOnly(JS 가 읽음)**, 민감정보 없음(값 '1').
// 프론트는 이게 있을 때만 refresh 를 호출한다 — 로그아웃 상태에서 불필요한 호출/400 을 없앤다.
// httpOnly refresh 쿠키와 항상 같이 세팅/삭제한다. 인증 판단이 아니라 "호출 여부" 판단용이다.
export const SESSION_HINT_COOKIE = 'hansapp.session';

// refresh 쿠키를 **갱신 엔드포인트로만** 스코프한다. path=/ 로 두면 민감한 refresh 토큰이 모든 요청
// (데이터 조회 등)에 자동 첨부돼 낭비·CSRF 표면·노출이 커진다. /oauth/token 에서만 오가게 좁힌다.
// (access token 은 쿠키가 아니라 Authorization: Bearer 로 authed 호출에만 붙는다 — 매 요청에 안 실린다.)
const REFRESH_PATH = '/oauth/token';

// **부팅 때 initRefreshCookie 로 한 번 굳히는 설정.** requestMeta·setRefreshCookie 는 요청마다
// 도는 핫패스라 매번 설정을 다시 읽지 않는다. init 전이면 안전한 기본값(secure=false, 도메인 없음).
//
//  - secure: HTTPS 로 서비스하면 켠다. sameSite 와는 **별개**다(그쪽은 lax 고정).
//  - cookieDomain: 서비스 루트 도메인(auth.rootDomain). SSO 서브도메인 세션 공유용.
//      예 `plzhans.com` → plzhans.com·auth.plzhans.com·api.plzhans.com 이 refresh 쿠키 공유
//      (구글 `.google.com` 방식, RFC 6265). 미설정이면 호스트 전용.
//  - clientIpHeader: rate limit·로그가 쓸 "진짜 클라 IP" 헤더. 미설정이면 req.ip 폴백.
let secure = false;
let cookieDomain: string | undefined;
let clientIpHeader: string | undefined;

/** 부팅 시점에 설정에서 값을 한 번 읽어 고정한다(main 부트스트랩에서 호출). */
export function initRefreshCookie(cfg: ConfigSource): void {
  secure = cfg.getBoolOrDefault('auth.cookieSecure', false);
  cookieDomain = cfg.getStringOrDefault('auth.rootDomain') || undefined;
  clientIpHeader =
    cfg.getStringOrDefault('apps-api.proxy.clientIpHeader') || undefined;
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure,
    // **lax 로 고정한다. secure 와 묶지 않는다.**
    //
    // none 으로 열면 아무 사이트나 이 쿠키를 태워 /oauth/token 을 부를 수 있다. 응답은
    // CORS 가 막지만 **요청은 이미 처리된다** — refresh 는 rotate 라서 그것만으로
    // 피해자의 세션이 무효화된다(공격자는 읽을 필요조차 없다).
    //
    // 외부 앱(medifinder)은 이 쿠키를 쓰지 않는다. 응답 바디의 refreshToken 을 자기가
    // 보관하고 바디로 보낸다(auth-sdk 의 TokenStorage) — 표준 OAuth 방식이라 lax 로도 무해하다.
    sameSite: 'lax',
    path: REFRESH_PATH,
    domain: cookieDomain,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  // 삭제도 같은 path·domain 이어야 브라우저가 지운다. 힌트 쿠키(path=/)도 함께 지운다.
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, domain: cookieDomain });
  res.clearCookie(SESSION_HINT_COOKIE, { path: '/', domain: cookieDomain });
}

/** 로그인 힌트 쿠키(읽을 수 있는 flag)를 refresh 쿠키와 같은 수명·도메인으로 세팅한다. */
function setSessionHint(res: Response, expiresAt: Date): void {
  res.cookie(SESSION_HINT_COOKIE, '1', {
    httpOnly: false, // 프론트 JS 가 읽어 refresh 호출 여부를 판단한다
    secure,
    // refresh 쿠키와 같은 이유로 lax 고정(위 setRefreshCookie 주석 참고).
    // 둘은 항상 같이 세팅·삭제되므로 조건도 같아야 한다.
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain,
    expires: expiresAt,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  // cookie-parser 가 Request.cookies 를 any 로 augment 하므로, 명시 타입으로 좁힌다.
  const cookies: Record<string, string> | undefined = (
    req as unknown as { cookies?: Record<string, string> }
  ).cookies;
  return cookies?.[REFRESH_COOKIE];
}

/**
 * 발급 토큰을 응답으로 변환한다. refresh 를 httpOnly 쿠키로 세팅(웹 보호)하는 동시에
 * 바디에도 담아(모바일·크로스플랫폼 스토리지) 어느 클라이언트든 쓸 수 있게 한다.
 */
export function respondTokens(
  res: Response,
  tokens: AuthTokens,
): TokenResponseDto {
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  setSessionHint(res, tokens.refreshExpiresAt);
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
  };
}

/**
 * 로그·세션 기록용 요청 부가정보(IP·UA)를 뽑는다.
 * IP 는 rate limit 과 동일한 resolveClientIp 로 뽑아 통일한다 — CLIENT_IP_HEADER(예: cf-connecting-ip)
 * 를 우선하고, 없으면 req.ip(trust proxy 결과)로 폴백한다. CF 처럼 XFF 가 비는 환경에서도 진짜 클라 IP 를 남긴다.
 */
export function requestMeta(req: Request): RequestMeta {
  return {
    ip: resolveClientIp(req, clientIpHeader),
    userAgent: req.headers['user-agent'] ?? null,
  };
}
