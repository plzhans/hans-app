/** 인증 백엔드(api.plzhans.com) base URL. .env.* 의 VITE_HANSAPP_BASE_URL 로 주입. */
export const API_BASE_URL =
  (import.meta.env.VITE_HANSAPP_BASE_URL as string | undefined) ?? '';

/**
 * 포털웹(hansapp-web) 홈 URL. VITE_PORTAL_WEB_URL 로 주입.
 *
 * **APP_ROOT_DOMAIN 에서 유도할 수 없다.** develop 은 포털이 develop.plzhans.com 인데
 * 루트 도메인은 plzhans.com 이라, 환경별 접두사를 규칙으로 뽑을 방법이 없다.
 * 로컬은 단일 오리진(포털 아래 /auth 로 마운트)이라 '/' 다.
 */
export const PORTAL_WEB_URL =
  (import.meta.env.VITE_PORTAL_WEB_URL as string | undefined) || '';

/**
 * 실행 환경 이름(local|develop|production). VITE_APP_ENV 로 주입, 백엔드 APP_ENV 와 같은 이름을 쓴다.
 * **vite 의 mode 로는 못 가른다** — develop 빌드도 production 빌드도 mode 는 production 이다.
 */
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
 * 서비스 루트 도메인(예: plzhans.com). 백엔드 APP_ROOT_DOMAIN 과 **같은 값**을 쓴다.
 * 로그인 후 복귀(return) 를 "이 도메인 계열(자신·서브도메인)"로만 허용하는 데 쓴다
 * — 백엔드 isFirstPartyOrigin 과 동일한 1st-party 정의. 비면 로컬로 보고 루프백만 허용한다.
 */
export const APP_ROOT_DOMAIN =
  (import.meta.env.VITE_APP_ROOT_DOMAIN as string | undefined)
    ?.replace(/^\./, '')
    .trim() ?? '';

/**
 * Google AdSense 게시자 ID(`ca-pub-…`). 비밀이 아니다 — 광고 태그에 그대로 실려 나간다.
 *
 * **비면 광고 영역을 아예 그리지 않는다.** 광고 단이 빠지면 카드도 원래 폭으로 돌아간다
 * (→ AuthCard). 값을 받기 전까지는 모든 환경이 비어 있다.
 */
export const GOOGLE_ADSENSE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT_ID as string | undefined) || '';

/**
 * 로그인 화면에 넣을 광고 단위 ID(AdSense 의 data-ad-slot).
 *
 * 게시자 ID 와 **따로 받는다** — 게시자 ID 는 계정 하나에 하나지만 단위 ID 는 광고 자리마다
 * 새로 만든다. 비어 있으면 광고 단은 자리만 잡고 아무것도 싣지 않는다.
 */
export const GOOGLE_ADSENSE_SLOT_LOGIN =
  (import.meta.env.VITE_GOOGLE_ADSENSE_SLOT_LOGIN as string | undefined) || '';

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
