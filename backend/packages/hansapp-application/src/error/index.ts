/**
 * 서비스 계층의 오류 번호와, 자주 던지는 오류 클래스.
 *
 * 기반 클래스(AppError 계열)는 `@hansapp/common` 에 있다 — 여기 있는 것은 **이 계층이
 * 공개 API 로 내보내는 계약**이다.
 */
export { ServiceErrorCode } from './service-error-code';
export { HospitalNotFoundError } from './service-error';
