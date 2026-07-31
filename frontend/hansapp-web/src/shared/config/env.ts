/** 인증 백엔드(api.plzhans.com) base URL. .env.* 의 VITE_HANSAPP_BASE_URL 로 주입. */
export const API_BASE_URL =
  (import.meta.env.VITE_HANSAPP_BASE_URL as string | undefined) ?? '';

/**
 * 인증웹(fe/hans-auth) base URL. VITE_AUTH_WEB_URL 로 주입.
 * 콘솔은 자기 로그인 UI 없이 인증웹으로 리다이렉트해 로그인하고, 공유 쿠키로 세션을 인지한다(1st-party).
 */
export const AUTH_WEB_URL =
  (import.meta.env.VITE_AUTH_WEB_URL as string | undefined) ?? '';

/**
 * 실행 환경 이름(local|develop|production). VITE_APP_ENV 로 주입, 백엔드 APP_ENV 와 같은 이름을 쓴다.
 * **vite 의 mode 로는 못 가른다** — develop 빌드도 production 빌드도 mode 는 production 이다.
 */
/**
 * 서비스 루트 도메인(예: plzhans.com). 백엔드 APP_ROOT_DOMAIN 과 **같은 값**을 쓴다.
 * 로그인 힌트 쿠키가 이 도메인으로 심기므로, 지울 때도 같은 값이 있어야 한다.
 */
export const APP_ROOT_DOMAIN =
  (import.meta.env.VITE_APP_ROOT_DOMAIN as string | undefined)
    ?.replace(/^\./, '')
    .trim() ?? '';

/**
 * 로그인 힌트 쿠키 이름. 백엔드 `auth.cookiePrefix` + `hansapp.session` 과 같아야 한다.
 *
 * **환경마다 다르다.** develop 과 운영이 쿠키 도메인(plzhans.com)을 공유하기 때문이다 —
 * develop-auth 는 develop.plzhans.com 의 서브도메인이 아니라 형제라 도메인을 좁힐 수 없다.
 * 이름까지 같으면 한쪽 로그인이 다른 쪽 세션을 덮어쓰고, 상대 DB 에 없는 토큰이라 거절된다.
 */
export const SESSION_HINT_COOKIE =
  (import.meta.env.VITE_SESSION_HINT_COOKIE_NAME as string | undefined) ||
  'hansapp.session';

export const APP_ENV =
  (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'local';

/**
 * Sentry DSN. 비밀이 아니다 — 이벤트 전송 전용 공개 엔드포인트라 어차피 번들에 구워진다.
 * **비면 Sentry 를 아예 켜지 않는다**(로컬 기본값).
 */
export const SENTRY_DSN =
  (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

/** 성능 트레이스 표본 비율(0=끔, 1=전부). 숫자가 아니면 0 으로 본다. */
export const SENTRY_TRACES_SAMPLE_RATE =
  Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0;

/** 이 산출물의 신원. vite define 이 빌드 때 박는다(→ vite.config.ts). Sentry release 로 쓴다. */
export const APP_RELEASE = __APP_RELEASE__;
