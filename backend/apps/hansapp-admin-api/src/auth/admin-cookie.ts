import type { Request, Response } from 'express';
import type { ConfigSource } from '@hansapp/common';
import type {
  AdminAuthTokens,
  AdminRequestMeta,
} from '@hansapp/admin-application/auth';
import { resolveClientIp } from '@hansapp/http-common';

import type { AdminTokenResponseDto } from './dto/admin-auth.dto';

/**
 * 쿠키 이름. **hansapp-api 것과 완전히 다른 이름을 쓴다.**
 *
 * 도메인을 붙이지 않아(host-only) 지금은 겹칠 수가 없지만, 언젠가 누가 SSO 를 붙이겠다고
 * domain 을 채우는 날 이름까지 같으면 두 세션이 서로를 덮어쓴다 — 공개 API 쪽에서 실제로
 * 났던 사고다(refresh-cookie.ts 의 resolveCookiePrefix 주석 참고).
 *
 * 앞에 환경 접두사가 붙는다(production 만 없음).
 */
const REFRESH_COOKIE_BASE = 'hansapp.admin_refresh_token';
const SESSION_HINT_COOKIE_BASE = 'hansapp.admin_session';

/**
 * refresh 쿠키를 인증 엔드포인트로만 스코프한다. path=/ 로 두면 민감한 refresh 토큰이
 * 모든 요청(목록 조회 등)에 자동 첨부돼 낭비·노출이 커진다. 업무 API 는 전부 `/api/*` 아래에
 * 두므로 이 쿠키가 실리지 않는다.
 *
 * **`/auth/token` 이 아니라 `/auth` 다.** 로그아웃(DELETE /auth/logout)도 이 쿠키로 대상을
 * 정해야 하기 때문이다 — 더 좁히면 로그아웃 요청에 쿠키가 안 실려 세션이 살아남는다.
 */
const REFRESH_PATH = '/auth';

// **부팅 때 initAdminCookie 로 한 번 굳히는 설정.** requestMeta·setAdminCookies 는 요청마다
// 도는 핫패스라 매번 설정을 다시 읽지 않는다. init 전이면 안전한 기본값(secure=false).
let secure = false;
let clientIpHeader: string | undefined;

/** 접두사가 붙은 최종 이름. init 에서 확정한다. */
export let REFRESH_COOKIE = REFRESH_COOKIE_BASE;
export let SESSION_HINT_COOKIE = SESSION_HINT_COOKIE_BASE;

/**
 * 쿠키 이름 접두사. **production 만 접두사가 없다.**
 *
 * 공개 API 와 같은 규칙을 쓴다 — 프론트가 두 규칙을 외우게 하지 않으려는 것이다.
 * 규칙이 프론트의 쿠키 이름 설정과 어긋나면 "로그인은 됐는데 화면은 로그아웃" 이 된다.
 */
function resolveCookiePrefix(cfg: ConfigSource, env: string): string {
  const configured = cfg.getStringOrDefault('auth.cookiePrefix');
  if (configured) return configured;
  return env === 'production' ? '' : `${env.toLowerCase()}.`;
}

/** 부팅 시점에 설정을 한 번 읽어 고정한다(main 부트스트랩에서 호출). */
export function initAdminCookie(cfg: ConfigSource, env: string): void {
  secure = cfg.getBoolOrDefault('auth.cookieSecure', false);
  clientIpHeader =
    cfg.getStringOrDefault('apps-admin-api.proxy.clientIpHeader') || undefined;

  const prefix = resolveCookiePrefix(cfg, env);
  REFRESH_COOKIE = prefix + REFRESH_COOKIE_BASE;
  SESSION_HINT_COOKIE = prefix + SESSION_HINT_COOKIE_BASE;
}

/**
 * 로그인 쿠키(refresh + 힌트)를 심는다.
 *
 * **항상 세션 쿠키다.** 관리자에게는 "로그인 상태 유지" 를 두지 않기로 했다 — 브라우저를
 * 닫으면 쿠키가 사라진다(서버 세션은 TTL 까지 살아 있다가 만료된다).
 * 그러려면 `expires` 를 **아예 주지 않아야** 한다. `undefined` 를 넣어도 안 되고 키 자체를
 * 만들지 않아야 한다 — 그래서 아래에 expires/maxAge 가 없다.
 */
export function setAdminCookies(res: Response, tokens: AdminAuthTokens): void {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    /*
      **strict 로 고정한다.** 공개 API 가 lax 인 것은 소셜 로그인 리다이렉트에 쿠키가
      실려야 해서인데, 관리자에는 그런 흐름이 없다(id/pwd 로그인 하나뿐). strict 면
      다른 사이트에서 시작된 요청에는 이 쿠키가 절대 실리지 않아 CSRF 가 원천 차단된다.

      부작용 하나: 메일·슬랙 링크로 처음 들어오는 최초 navigation 에도 쿠키가 안 실린다.
      그 요청은 정적 파일(SPA)을 받는 것뿐이고, SPA 가 뜬 뒤 부르는 갱신 요청은 same-site 라
      정상 동작한다 — 다만 "링크로 들어오면 한 번 로그인 화면을 본다" 는 프론트와 합의된 동작이다.
    */
    sameSite: 'strict',
    path: REFRESH_PATH,
    // **domain 을 주지 않는다(host-only).** 관리자 세션을 서브도메인끼리 공유할 이유가 없다.
  });

  // 프론트 JS 가 읽어 "갱신을 시도할지" 를 판단하는 힌트. 값 자체엔 아무 권한이 없다.
  res.cookie(SESSION_HINT_COOKIE, '1', {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
  });
}

/** 로그인 쿠키를 지운다. **심을 때와 같은 path 여야** 브라우저가 지운다. */
export function clearAdminCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  // 힌트 쿠키(path=/)도 함께 지운다. 둘은 항상 같이 살고 같이 죽는다.
  res.clearCookie(SESSION_HINT_COOKIE, { path: '/' });
}

export function readRefreshCookie(req: Request): string | undefined {
  // cookie-parser 가 Request.cookies 를 any 로 augment 하므로, 명시 타입으로 좁힌다.
  const cookies: Record<string, string> | undefined = (
    req as unknown as { cookies?: Record<string, string> }
  ).cookies;
  return cookies?.[REFRESH_COOKIE];
}

/**
 * 발급 토큰을 응답으로 바꾼다.
 *
 * **refresh token 은 바디에 담지 않는다.** 공개 API 는 모바일·크로스플랫폼 클라이언트를
 * 위해 바디에도 실어 주지만, 관리자 클라이언트는 같은 오리진의 SPA 하나뿐이라 쿠키로 충분하다.
 * 바디에 실으면 JS 가 만질 수 있는 자리가 생기고, 그게 유일한 유출 경로가 된다.
 */
export function respondTokens(
  res: Response,
  tokens: AdminAuthTokens,
): AdminTokenResponseDto {
  setAdminCookies(res, tokens);
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
    // 프론트가 이 값을 보고 비밀번호 변경 화면으로 보낸다.
    // (막는 것은 서버 가드가 하고, 이건 화면을 그리기 위한 신호다.)
    mustChangePassword: tokens.mustChangePassword,
  };
}

/** 로그·세션 기록용 요청 부가정보(IP·UA). */
export function requestMeta(req: Request): AdminRequestMeta {
  return {
    ip: resolveClientIp(req, clientIpHeader),
    userAgent: req.headers['user-agent'] ?? null,
  };
}
