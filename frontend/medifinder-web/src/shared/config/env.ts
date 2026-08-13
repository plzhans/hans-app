/**
 * 빌드 시점에 굳는 산출물 정보.
 *
 * **여기 있는 값은 전부 공개다.** vite 가 그대로 번들에 박으므로 페이지 소스만 열면 보인다.
 * 비밀값을 넣으면 안 된다.
 */

/** 실행 환경 이름(local|develop|production). 백엔드 APP_ENV 와 같은 이름을 쓴다. */
export const APP_ENV =
  (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'local';

/** 산출물 신원(`<버전>-<sha 7자리>`). vite define 이 빌드 때 박는다(→ vite.config.ts). */
export const APP_RELEASE = __APP_RELEASE__;

/**
 * 이 산출물을 구운 시각(ISO·UTC). 같은 define 이 넣는다.
 *
 * 개발 서버로 띄웠으면 **dev server 를 켠 시각**이다 — 코드를 고쳐도 갱신되지 않는다.
 */
export const APP_BUILT_AT = __APP_BUILT_AT__;
