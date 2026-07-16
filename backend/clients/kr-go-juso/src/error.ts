/**
 * 도로명주소 검색 API 호출 실패.
 *
 * 이 파일과 http.ts 는 영문주소에 국한된 게 없다 — business.juso.go.kr 의 다른 검색
 * API(도로명 API, 좌표 API 등)도 같은 봉투(results.common.errorCode)를 쓴다. juso 서비스가
 * 늘면 두 파일을 이 패키지의 공용 모듈로 빼 재사용한다. (data.go.kr(@krdata/*) 은
 * ServiceKey·XML 봉투가 달라 @krdata/core 를 재사용할 수 없다 — 런타임이 별개다.)
 * 지금은 소비자가 하나뿐이라 미리 쪼개지 않는다.
 */
export class JusoError extends Error {
  /** results.common.errorCode ('E0001', '-999') 이거나 HTTP 상태코드다. */
  readonly errorCode: string;

  /** 원본 응답 본문. XML 로 올 수도 있어 문자열 그대로 남긴다. **confmKey 는 절대 담지 않는다.** */
  readonly responseBody?: string;

  constructor(
    message: string,
    errorCode = 'UNKNOWN',
    options?: { cause?: unknown; responseBody?: string },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'JusoError';
    this.errorCode = errorCode;
    this.responseBody = options?.responseBody;
  }
}

/** 정상 처리. errorCode 가 이 값이 아니면 실패로 본다. */
export const ERROR_OK = '0';

/**
 * 인증(승인키) 문제. 재시도해도 소용없고 **사람이 키를 고쳐야** 한다.
 *   E0001  승인되지 않은 KEY (검색 API 승인키가 아닌 다른 키를 넣은 경우 포함)
 *   E0014  개발승인키 기간 만료 — 재발급 필요
 */
export const ERROR_BAD_KEY = new Set(['E0001', 'E0014']);
