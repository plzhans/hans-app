/**
 * 서울열린데이터광장 API 호출 실패.
 *
 * 이 파일과 http.ts 는 지하철에 국한된 게 없다 — 서울열린데이터광장의 **모든** 서비스가
 * 같은 봉투를 쓴다. 서울 데이터셋을 하나 더 붙이는 날 이 두 파일을 `@seouldata/core` 로
 * 통째로 옮기면 krdata(core/hira/nmc) 와 대칭이 된다. 지금은 소비자가 하나뿐이라
 * 패키지를 미리 쪼개지 않는다.
 */
export class SeoulDataError extends Error {
  /** RESULT.CODE ('INFO-100', 'ERROR-336') 이거나 HTTP 상태코드다. */
  readonly errorCode: string;

  /** 실패한 서비스명. 'SearchSTNBySubwayLineInfo'. **인증키는 절대 담지 않는다.** */
  readonly service?: string;

  /** 원본 응답 본문. XML 로 올 수도 있어 문자열 그대로 남긴다. */
  readonly responseBody?: string;

  constructor(
    message: string,
    errorCode = 'UNKNOWN',
    options?: { cause?: unknown; responseBody?: string; service?: string },
  ) {
    super(options?.service ? `[${options.service}] ${message}` : message, {
      cause: options?.cause,
    });
    this.name = 'SeoulDataError';
    this.errorCode = errorCode;
    this.service = options?.service;
    this.responseBody = options?.responseBody;
  }
}

/** 정상 처리. */
export const RESULT_OK = 'INFO-000';

/**
 * 조건에 맞는 데이터가 없다.
 *
 * **에러가 아니다.** 필터가 아무것도 못 맞힌 정상적인 빈 결과다. 이걸 예외로 만들면
 * 호출부가 "없음"과 "고장"을 구분하려고 예외 메시지를 문자열 비교하게 된다.
 * 빈 배열로 돌려준다.
 */
export const RESULT_EMPTY = 'INFO-200';

/**
 * 인증키가 유효하지 않다. 이건 재시도해도 안 된다 — 사람이 키를 고쳐야 한다.
 */
export const RESULT_BAD_KEY = 'INFO-100';

/**
 * 실패한 서비스명을 뽑는다. 에러 메시지·로그에 쓴다.
 *
 * **URL 을 통째로 남기면 안 된다.** 서울열린데이터광장은 인증키를 쿼리가 아니라 **경로**에
 * 담기 때문에, URL 이 로그나 DB(sync_state.error)에 찍히는 순간 키가 유출된다.
 *
 * 받는 url 은 생성된 코드가 만든 **키 없는** 경로다. 키는 그 뒤에 http.ts 가 붙인다.
 *   여기 오는 값   /json/SearchSTNBySubwayLineInfo/1/1000/...
 *   실제 요청 URL  http://openapi.seoul.go.kr:8088/{KEY}/json/SearchSTNBySubwayLineInfo/...
 */
export function toServiceName(url: string): string | undefined {
  // /{TYPE}/{SERVICE}/... → 두 번째 세그먼트
  const segments = new URL(url, 'http://x').pathname.split('/').filter(Boolean);
  return segments[1];
}
