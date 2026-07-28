/** 인증 백엔드(api.plzhans.com) base URL. .env.* 의 VITE_HANSAPP_BASE_URL 로 주입. */
export const API_BASE_URL =
  (import.meta.env.VITE_HANSAPP_BASE_URL as string | undefined) ?? '';

/**
 * 실행 환경 이름(local|develop|production). VITE_APP_ENV 로 주입, 백엔드 APP_ENV 와 같은 이름을 쓴다.
 * **vite 의 mode 로는 못 가른다** — develop 빌드도 production 빌드도 mode 는 production 이다.
 */
export const APP_ENV =
  (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'local';

/**
 * 서비스 루트 도메인(예: plzhans.com). 백엔드 APP_ROOT_DOMAIN 과 **같은 값**을 쓴다.
 * 로그인 후 복귀(return) 를 "이 도메인 계열(자신·서브도메인)"로만 허용하는 데 쓴다
 * — 백엔드 isFirstPartyOrigin 과 동일한 1st-party 정의. 비면 로컬로 보고 루프백만 허용한다.
 */
export const APP_ROOT_DOMAIN =
  (import.meta.env.VITE_APP_ROOT_DOMAIN as string | undefined)
    ?.replace(/^\./, '')
    .trim() ?? '';

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
