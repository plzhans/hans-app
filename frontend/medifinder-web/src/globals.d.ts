/**
 * 빌드 시점에 vite 의 define 이 상수로 치환하는 값들.
 * 런타임 변수가 아니라 번들에 리터럴로 박히므로 여기 선언만 해 둔다.
 */

/** 산출물 신원. `<package.json version>-<git sha 7자리>` (로컬 빌드면 sha 자리가 dev). */
declare const __APP_RELEASE__: string;
