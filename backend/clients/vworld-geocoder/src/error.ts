/** 브이월드 API 호출 실패 */
export class VworldError extends Error {
  /** 오류 코드. 응답 error.code 이거나 HTTP 상태코드다. */
  readonly errorCode: string;

  /** 오류 레벨. 1(파라미터) · 2(인증·한도) · 3(시스템) */
  readonly level?: string;

  /** 실패한 오퍼레이션. GetCoord · GetAddress */
  readonly operation?: string;

  /** 원본 응답 본문 (있는 경우) */
  readonly responseBody?: string;

  constructor(
    message: string,
    errorCode = 'UNKNOWN',
    options?: {
      cause?: unknown;
      level?: string;
      operation?: string;
      responseBody?: string;
    },
  ) {
    super(options?.operation ? `[${options.operation}] ${message}` : message, {
      cause: options?.cause,
    });
    this.name = 'VworldError';
    this.errorCode = errorCode;
    this.level = options?.level;
    this.operation = options?.operation;
    this.responseBody = options?.responseBody;
  }
}

/**
 * 일일 호출 한도 초과.
 *
 * 브이월드는 지오코딩을 일 40,000건으로 제한한다. 한도는 우리가 세지 않는다 —
 * 세면 반드시 어긋난다(실패한 콜이 잡히는지, 다른 프로세스가 같은 키를 쓰는지 알 수 없다).
 * 원본이 아는 사실은 원본에게 묻는다. (@krdata/core 와 같은 방침)
 *
 * 배치가 쓴다면 이 예외를 **실패가 아니라 "오늘은 여기까지"** 로 다뤄야 한다.
 */
export class VworldQuotaError extends VworldError {
  constructor(message: string, options?: { operation?: string; responseBody?: string }) {
    super(message, 'OVER_REQUEST_LIMIT', { ...options, level: '2' });
    this.name = 'VworldQuotaError';
  }
}

/**
 * 인증키 문제. 한도 초과와 구분한다 — 이건 시간이 지나도 저절로 안 풀린다.
 *
 *   INVALID_KEY     등록되지 않은 키
 *   INCORRECT_KEY   키 정보 오류(도메인 불일치). 지오코딩은 도메인 검사를 안 타지만
 *                   같은 키로 지도 API 를 부르면 걸릴 수 있다.
 *   UNAVAILABLE_KEY 임시 사용 불가
 */
export class VworldAuthError extends VworldError {
  constructor(
    message: string,
    errorCode: string,
    options?: { operation?: string; responseBody?: string },
  ) {
    super(message, errorCode, { ...options, level: '2' });
    this.name = 'VworldAuthError';
  }
}

const AUTH_CODES = ['INVALID_KEY', 'INCORRECT_KEY', 'UNAVAILABLE_KEY'];

export function isAuthError(code: string): boolean {
  return AUTH_CODES.includes(code);
}

export function isQuotaExceeded(code: string): boolean {
  return code === 'OVER_REQUEST_LIMIT';
}
