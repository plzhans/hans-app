import type { KrDataDisposition } from './gateway-code';

/** 공공데이터포털 API 호출 실패 */
export class KrDataError extends Error {
  /** 결과코드. HTTP 상태코드이거나 응답 header.resultCode 이거나 XML 에러코드다. */
  readonly errorCode: string;

  /**
   * 이 오류를 어떻게 다뤄야 하나. 판정은 gateway-code 의 표가 한다.
   *
   * 예외가 여기까지 왔다는 것은 재시도가 끝났거나(retry 였으나 소진) 재시도 대상이
   * 아니었다는 뜻이다. **호출부가 다시 판정할 필요는 없다** — 한도(quota)만 따로 잡으면 된다.
   */
  readonly disposition: KrDataDisposition;

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
    options?: {
      cause?: unknown;
      responseBody?: string;
      endpoint?: string;
      disposition?: KrDataDisposition;
    },
  ) {
    super(options?.endpoint ? `[${options.endpoint}] ${message}` : message, {
      cause: options?.cause,
    });
    this.name = 'KrDataError';
    this.errorCode = errorCode;
    this.disposition = options?.disposition ?? 'fail';
    this.endpoint = options?.endpoint;
    this.responseBody = options?.responseBody;
  }
}

/**
 * 일일 호출 한도 초과.
 *
 * 한도는 **API 별**이고(HIRA 10,000/일, NMC 1,000/일) 우리가 세지 않는다. 우리가 세면
 * 반드시 어긋난다 — 실패한 콜이 한도에 잡히는지, 다른 프로세스가 같은 키를 쓰는지 알 수
 * 없기 때문이다. 원본이 아는 사실은 원본에게 묻는다.
 *
 * 배치는 이 예외를 **실패가 아니라 "오늘은 여기까지"** 로 다룬다. 다음 날 이어받는다.
 *
 * **초당 한도(23)는 여기 오지 않는다.** 그쪽은 잠깐 쉬면 풀리므로 재시도로 다룬다.
 */
export class KrDataQuotaError extends KrDataError {
  constructor(message: string, errorCode: string, responseBody?: string, endpoint?: string) {
    super(message, errorCode, { responseBody, endpoint, disposition: 'quota' });
    this.name = 'KrDataQuotaError';
  }
}
