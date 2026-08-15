import { BadRequestError, NotFoundError, UnauthorizedError } from '@hansapp/common';
import type { AppErrorCode } from '@hansapp/common';

import { AdminErrorCode } from './admin-error-code';

/**
 * 관리자 계층에서 자주 던지는 오류. **번호를 자리마다 안 적으려고 있다.**
 *
 * 여기 두는 기준은 다른 계층(auth-error.ts)과 같다 — **여러 곳에서 같은 계열로 던지는
 * 번호만** 둔다. 한 번만 쓰는 번호는 `new NotFoundError(AdminErrorCode.X)` 로 넘긴다.
 */

/** 관리자 계정을 못 찾았다. */
export class AdminNotFoundError extends NotFoundError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_NOT_FOUND;
}

/** 회원을 못 찾았다. */
export class AdminUserNotFoundError extends NotFoundError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_USER_NOT_FOUND;
}

/** 게시판을 못 찾았다. */
export class AdminBoardNotFoundError extends NotFoundError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_BOARD_NOT_FOUND;
}

/** 게시판 이름이 이미 쓰이고 있다. */
export class AdminBoardNameInUseError extends BadRequestError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_BOARD_NAME_IN_USE;
}

/**
 * 구글 로그인이 실패했다.
 *
 * **왜 실패했는지는 밖에 안 알린다** — 실패 사유를 나누면 어느 이메일이 등록돼 있는지
 * 떠보는 통로가 된다. 사유는 던지는 자리에서 로그로만 남긴다.
 */
export class AdminGoogleSignInFailedError extends UnauthorizedError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_GOOGLE_SIGN_IN_FAILED;
}

/** 지원하지 않는 LLM 업체다. */
export class AdminLlmProviderUnsupportedError extends BadRequestError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_LLM_PROVIDER_UNSUPPORTED;
}

/** 지원하지 않는 언어다. */
export class AdminLocaleUnsupportedError extends BadRequestError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_LOCALE_UNSUPPORTED;
}

/** 모르는 시간대다. */
export class AdminTimeZoneUnknownError extends BadRequestError {
  static readonly code: AppErrorCode = AdminErrorCode.ADMIN_TIME_ZONE_UNKNOWN;
}
