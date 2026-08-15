/**
 * 빌드 시점에 번들로 구워지는 설정값.
 *
 * **여기 있는 값은 전부 공개다.** vite 가 VITE_ 접두사 변수를 그대로 번들에 박으므로
 * 페이지 소스만 열면 보인다. 비밀값을 VITE_ 로 넣으면 안 된다.
 */

export const APP_ENV = import.meta.env.VITE_APP_ENV ?? 'local';

/**
 * 관리자 API 주소.
 *
 * 배포에서는 프론트와 API 가 같은 오리진이라 빈 값(상대 경로)이어도 된다. 로컬만
 * 포트가 갈려 절대 주소가 필요하다. 끝의 `/` 는 떼서 경로를 붙일 때 `//` 가 되지 않게 한다.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_ADMIN_API_BASE_URL ?? ''
).replace(/\/+$/, '');

/**
 * 로그인 힌트 쿠키 이름. 백엔드가 심는 이름과 **글자 단위로 같아야 한다**.
 *
 * 이 값이 어긋나면 refresh 쿠키는 멀쩡한데 프론트가 "로그인한 적 없다" 고 판단해
 * 로그인 화면을 띄운다 — 공개 API 쪽에서 실제로 났던 사고다.
 */
export const SESSION_HINT_COOKIE =
  import.meta.env.VITE_SESSION_HINT_COOKIE_NAME ?? 'hansapp.admin_session';

/**
 * Sentry DSN. 전송 전용 공개 엔드포인트라 비밀이 아니다(번들에 박혀도 된다).
 *
 * **비면 Sentry 를 아예 켜지 않는다**(로컬 기본값).
 */
export const SENTRY_DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

/** 성능 트레이스 표본 비율(0=끔, 1=전부). 숫자가 아니면 0 으로 본다. */
export const SENTRY_TRACES_SAMPLE_RATE =
  Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0;

/** 빌드 신원(버전-커밋). vite.config.ts 의 define 이 넣는다. */
export const APP_RELEASE = __APP_RELEASE__;

/**
 * 이 산출물을 구운 시각(ISO·UTC). 같은 define 이 넣는다.
 *
 * 개발 서버로 띄웠으면 **dev server 를 켠 시각**이다 — 코드를 고쳐도 갱신되지 않는다.
 */
export const APP_BUILT_AT = __APP_BUILT_AT__;
