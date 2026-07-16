/**
 * 심평원 홈페이지 호출 실패.
 *
 * data.go.kr(@krdata/*)·juso(@kr-go/*) 와 봉투가 근본적으로 다르다 — 여긴 애초에 공개 API 가
 * 아니라 웹 프런트라서, resultCode 같은 성공/실패 코드 자체가 없다. 그래서 core 를 재사용하지
 * 않고 이 패키지가 자기 에러를 갖는다.
 */
export class HiraWebError extends Error {
  /** HTTP 상태코드이거나 이 패키지가 붙인 사유('PARSE', 'NETWORK', 'NO_HOSPITAL_ID'). */
  readonly errorCode: string;

  /** 원본 응답 본문 앞부분. HTML 로 올 수도 있어 문자열 그대로 남긴다. */
  readonly responseBody?: string;

  constructor(
    message: string,
    errorCode = 'UNKNOWN',
    options?: { cause?: unknown; responseBody?: string },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'HiraWebError';
    this.errorCode = errorCode;
    this.responseBody = options?.responseBody;
  }
}
