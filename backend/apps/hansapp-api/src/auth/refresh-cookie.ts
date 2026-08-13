import type { Request, Response } from 'express';
import type { AuthTokens, RequestMeta } from '@hansapp/auth-application';

import type { ConfigSource } from '@hansapp/common';

import { resolveClientIp } from '@hansapp/http-common';

import type { TokenResponseDto } from './dto/auth.dto';

/**
 * 쿠키 이름. **환경 접두사가 붙는다**(auth.cookiePrefix — 운영은 없음, develop 은 `develop.`).
 *
 * 붙이지 않으면 develop 과 운영이 같은 쿠키를 쓴다. 두 환경의 호스트가 develop-api·api 처럼
 * plzhans.com 의 형제라 쿠키 도메인을 둘 다 plzhans.com 까지 올려야 하기 때문이다
 * (develop-auth 는 develop.plzhans.com 의 서브도메인이 아니다). 그러면 한쪽에서 로그인할 때마다
 * 다른 쪽 세션 토큰을 덮어쓰고, 덮어쓴 토큰은 상대 DB 에 없어 거절당한다 — 서로 로그아웃시킨다.
 */
const REFRESH_COOKIE_BASE = 'hansapp.refresh_token';
const SESSION_HINT_COOKIE_BASE = 'hansapp.session';

// refresh 쿠키를 **OAuth 엔드포인트로만** 스코프한다. path=/ 로 두면 민감한 refresh 토큰이 모든
// 요청(데이터 조회 등)에 자동 첨부돼 낭비·CSRF 표면·노출이 커진다.
// (access token 은 쿠키가 아니라 Authorization: Bearer 로 authed 호출에만 붙는다 — 매 요청에 안 실린다.)
//
// **/oauth/token 이 아니라 /oauth 다.** 로그아웃(/oauth/logout)도 이 쿠키로 인증해야 하기 때문이다 —
// access token 을 요구하면 만료됐을 때 로그아웃이 거절되고, 그 응답엔 쿠키 삭제도 안 실려 세션이 산다.
const REFRESH_PATH = '/oauth';

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

/** 접두사가 붙은 최종 이름. init 에서 확정한다. */
export let REFRESH_COOKIE = REFRESH_COOKIE_BASE;
export let SESSION_HINT_COOKIE = SESSION_HINT_COOKIE_BASE;

/**
 * 쿠키 이름 접두사를 정한다. **설정이 비면 환경 이름에서 유도한다.**
 *
 * 접두사가 필요한 이유는 쿠키 Domain 이 `plzhans.com` 까지 올라가서다 — develop 과 운영이
 * 같은 도메인을 공유하므로 이름까지 같으면 한쪽에 로그인할 때마다 다른 쪽 세션 토큰을
 * 덮어쓰고, 그 토큰은 상대 DB 에 없어 거절된다.
 *
 * 그래서 환경마다 달라야 하는데, 설정 파일에 손으로 적다 보니 **local 만 빠져 있었다.**
 * 백엔드는 접두사 없이 심고 프론트는 `local.` 을 찾아서, 로그인은 됐는데 화면은 로그아웃으로
 * 보였다. 규칙으로 유도하면 그런 어긋남이 생기지 않는다.
 *
 * **production 만 접두사가 없다.** 운영이 이름의 기준이고 나머지 환경이 거기서 갈라지는
 * 구조다 — 배포된 프론트들이 `hansapp.session` 을 찾고 있어서, 여기서 `production.` 을 붙이면
 * 그 이름을 여섯 군데(앱 2개 × 환경 3개) 함께 바꿔야 하고 운영 세션이 한 번 끊긴다.
 *
 * 프론트는 지금처럼 env 파일에 이름을 그대로 적는다. 여기 규칙과 그쪽 값이 어긋나면 로그인은
 * 되는데 화면만 로그아웃으로 보이므로(이번에 난 사고가 그것이다), 규칙을 바꿀 때는 프론트의
 * `VITE_SESSION_HINT_COOKIE_NAME` 여섯 줄을 반드시 같이 본다.
 */
function resolveCookiePrefix(cfg: ConfigSource, env: string): string {
  const configured = cfg.getStringOrDefault('auth.cookiePrefix');
  if (configured) return configured;
  return env === 'production' ? '' : `${env.toLowerCase()}.`;
}

/** 부팅 시점에 설정에서 값을 한 번 읽어 고정한다(main 부트스트랩에서 호출). */
export function initRefreshCookie(cfg: ConfigSource, env: string): void {
  secure = cfg.getBoolOrDefault('auth.cookieSecure');
  cookieDomain = cfg.getStringOrDefault('auth.rootDomain') || undefined;
  clientIpHeader = cfg.getStringOrDefault('apps-api.proxy.clientIpHeader') || undefined;

  const prefix = resolveCookiePrefix(cfg, env);
  REFRESH_COOKIE = prefix + REFRESH_COOKIE_BASE;
  SESSION_HINT_COOKIE = prefix + SESSION_HINT_COOKIE_BASE;
}

/**
 * refresh 쿠키를 심는다.
 *
 * **persistent 가 만료를 정한다.** 켜면 만료 시각이 박힌 영속 쿠키라 브라우저를 닫아도 남고,
 * 끄면 `expires` 를 아예 주지 않아 세션 쿠키가 된다 — 브라우저를 닫을 때 사라진다.
 * 서버 세션은 어느 쪽이든 TTL 까지 살아 있다(쿠키만 사라질 뿐이다).
 *
 * **탭 사이 공유는 둘 다 된다.** 세션 쿠키도 같은 브라우저의 모든 탭이 함께 본다 —
 * 탭마다 갈리는 건 sessionStorage 이지 쿠키가 아니다.
 */
export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  persistent: boolean,
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
    // 세션 쿠키로 만들려면 expires 를 **주지 않아야** 한다(undefined 로도 안 된다).
    ...(persistent ? { expires: expiresAt } : {}),
  });
}

export function clearRefreshCookie(res: Response): void {
  // 삭제도 **심을 때와 같은 path·domain** 이어야 브라우저가 지운다.
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, domain: cookieDomain });
  // 힌트 쿠키(path=/)도 함께 지운다. 둘은 항상 같이 살고 같이 죽는다.
  res.clearCookie(SESSION_HINT_COOKIE, { path: '/', domain: cookieDomain });
}

/** 로그인 힌트 쿠키(읽을 수 있는 flag)를 refresh 쿠키와 같은 수명·도메인으로 세팅한다. */
function setSessionHint(res: Response, expiresAt: Date, persistent: boolean): void {
  res.cookie(SESSION_HINT_COOKIE, '1', {
    httpOnly: false, // 프론트 JS 가 읽어 refresh 호출 여부를 판단한다
    secure,
    // refresh 쿠키와 같은 이유로 lax 고정(위 setRefreshCookie 주석 참고).
    // 둘은 항상 같이 세팅·삭제되므로 조건도 같아야 한다.
    sameSite: 'lax',
    path: '/',
    domain: cookieDomain,
    // refresh 쿠키와 항상 같이 살고 같이 죽는다 — 수명 조건도 같아야 한다.
    ...(persistent ? { expires: expiresAt } : {}),
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
 * 로그인 쿠키(refresh + 힌트)만 심는다. **바디를 실을 수 없는 응답용**이다.
 *
 * 소셜 콜백은 리다이렉트(302)라 바디가 없다. 그래서 access token 을 돌려줄 자리가 없고,
 * 도착한 앱이 이 쿠키로 /oauth/token 을 한 번 불러 채운다(hansapp-web 의 authStore.bootstrap).
 */
export function setLoginCookies(res: Response, tokens: AuthTokens): void {
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt, tokens.persistent);
  setSessionHint(res, tokens.refreshExpiresAt, tokens.persistent);
}

/**
 * 발급 토큰을 응답으로 변환한다. refresh 를 httpOnly 쿠키로 세팅(웹 보호)하는 동시에
 * 바디에도 담아(모바일·크로스플랫폼 스토리지) 어느 클라이언트든 쓸 수 있게 한다.
 */
export function respondTokens(res: Response, tokens: AuthTokens): TokenResponseDto {
  setLoginCookies(res, tokens);
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
