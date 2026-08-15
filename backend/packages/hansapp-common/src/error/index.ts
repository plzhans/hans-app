/**
 * 응용 계층의 오류 표현. **HTTP 를 모른다** — 상태 코드로 옮기는 일은
 * `@hansapp/http-common` 의 전역 예외 필터가 한다.
 *
 * **도메인 오류 번호는 여기 없다.** 번호는 API 계약이라 그 API 를 내보내는 계층이 들고 있다
 * (auth-application·application·admin-application). 여기 있는 것은 기반 클래스와, 계층을
 * 가릴 수 없는 공통 번호(10000대)뿐이다.
 */
export { CommonErrorCode } from './common-error-code';
export {
  message,
  registerErrorCodes,
  errorMessageOf,
  errorCodeOwner,
  registeredErrorCodes,
} from './error-code-registry';
export type { AppErrorCode } from './error-code-registry';

// 계열 기준 클래스. 상속이 상태 코드가 아니라 "누구 잘못인가" 를 따른다(app-error.ts 주석).
export {
  AppError,
  BadRequestError,
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  UnavailableError,
  UpstreamTimeoutError,
  InternalError,
  NotImplementedError,
} from './app-error';
export type { AppErrorKind, AppErrorOptions } from './app-error';
