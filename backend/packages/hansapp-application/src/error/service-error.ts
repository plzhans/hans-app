import { NotFoundError } from '@hansapp/common';
import type { AppErrorCode } from '@hansapp/common';

import { ServiceErrorCode } from './service-error-code';

/**
 * 서비스 계층에서 자주 던지는 오류. **번호를 자리마다 안 적으려고 있다.**
 *
 * 여기 두는 기준은 인증 계층(auth-error.ts)과 같다 — **여러 곳에서 같은 계열로 던지는
 * 번호만** 둔다. 한 번만 쓰는 번호는 `new NotFoundError(ServiceErrorCode.REGION_NOT_FOUND)`
 * 처럼 인자로 넘긴다.
 */

/** 병원을 못 찾았다. */
export class HospitalNotFoundError extends NotFoundError {
  static readonly code: AppErrorCode = ServiceErrorCode.HOSPITAL_NOT_FOUND;
}
