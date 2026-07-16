/**
 * 국세청 사업자등록 API 호출 실패.
 *
 * 이 파일과 http.ts 는 진위확인·상태조회에 국한된 게 없다 — odcloud.kr 로 서비스되는
 * 다른 POST+JSON API 도 같은 봉투(status_code)를 쓴다. 소비자가 늘면 공용 모듈로 뺀다.
 * 지금은 소비자가 하나뿐이라 미리 쪼개지 않는다.
 */
export class NtsError extends Error {
  /** status_code ('TOO_LARGE_REQUEST', 'INTERNAL_ERROR') 이거나 HTTP 상태코드다. */
  readonly errorCode: string;

  /** 원본 응답 본문. XML 로 올 수도 있어 문자열 그대로 남긴다. **serviceKey 는 절대 담지 않는다.** */
  readonly responseBody?: string;

  constructor(
    message: string,
    errorCode = 'UNKNOWN',
    options?: { cause?: unknown; responseBody?: string },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'NtsError';
    this.errorCode = errorCode;
    this.responseBody = options?.responseBody;
  }
}

/** 정상 처리. status_code 가 이 값이 아니면 실패로 본다. */
export const STATUS_OK = 'OK';
