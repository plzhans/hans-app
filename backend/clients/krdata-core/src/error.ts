/** 공공데이터포털 API 호출 실패 */
export class KrDataError extends Error {
  /** 결과코드. HTTP 상태코드이거나 응답 header.resultCode 이거나 XML 에러코드다. */
  readonly errorCode: string;

  /**
   * 실패한 API. "MadmDtlInfoService2.7/getTrnsprtInfo2.7" 처럼 서비스/오퍼레이션이다.
   *
   * **한도도 권한도 API 별로 걸린다.** 어느 API 가 막혔는지 모르면 손을 쓸 수 없다 —
   * 활용신청이 안 된 API 인지, 그 API 만 한도를 다 쓴 것인지 구분이 안 된다.
   * 서비스키는 절대 담지 않는다.
   */
  readonly endpoint?: string;

  /** 원본 응답 본문 (있는 경우) */
  readonly responseBody?: string;

  constructor(
    message: string,
    errorCode = 'UNKNOWN',
    options?: { cause?: unknown; responseBody?: string; endpoint?: string },
  ) {
    super(options?.endpoint ? `[${options.endpoint}] ${message}` : message, {
      cause: options?.cause,
    });
    this.name = 'KrDataError';
    this.errorCode = errorCode;
    this.endpoint = options?.endpoint;
    this.responseBody = options?.responseBody;
  }
}

/**
 * 일일 호출 한도 초과.
 *
 * 공공데이터포털은 한도를 넘기면 resultCode 22 (LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR)
 * 로 답한다. 한도는 **API 별**이고(HIRA 10,000/일, NMC 1,000/일) 우리가 세지 않는다.
 * 우리가 세면 반드시 어긋난다 — 실패한 콜이 한도에 잡히는지, 다른 프로세스가 같은 키를 쓰는지
 * 알 수 없기 때문이다. 원본이 아는 사실은 원본에게 묻는다.
 *
 * 배치는 이 예외를 **실패가 아니라 "오늘은 여기까지"** 로 다룬다. 다음 날 이어받는다.
 */
export class KrDataQuotaError extends KrDataError {
  constructor(
    message: string,
    errorCode: string,
    responseBody?: string,
    endpoint?: string,
  ) {
    super(message, errorCode, { responseBody, endpoint });
    this.name = 'KrDataQuotaError';
  }
}

/**
 * 한도 초과인가.
 *
 * 원본이 세 가지 형태로 알려준다. 하나만 보면 놓친다.
 *   resultCode 22                                    JSON 응답 헤더
 *   LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR XML 에러
 *   HTTP 429 "API token quota exceeded"              게이트웨이 단에서 막을 때 (실측 2026-07)
 */
export function isQuotaExceeded(code: string, body?: string): boolean {
  if (code === '22' || code === '429') {
    return true;
  }
  if (body === undefined) {
    return false;
  }
  return (
    body.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS') ||
    /quota exceeded/i.test(body)
  );
}
