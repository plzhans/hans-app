/**
 * 공공데이터포털 게이트웨이 공통 오류코드.
 *
 * 기관 API 가 아니라 **게이트웨이가** 내는 오류라 부처가 달라도 같은 코드가 온다.
 * 그래서 기관별 클라이언트가 아니라 공통 모듈인 여기에 둔다.
 *
 * ## 이 표가 정하는 것
 *
 * 코드마다 처리 방침(disposition)을 하나씩 붙인다. 호출부는 번호를 외우지 않고 방침만 본다.
 * 새 코드가 생기면 이 파일에 한 줄 더하면 끝이고, 재시도 루프도 예외 계층도 건드릴 일이 없다.
 *
 *   retry  다시 부르면 되는 것. 포털 안내문이 "잠시 후 다시 호출" 인 코드들이다.
 *   quota  실패가 아니라 "오늘은 여기까지". 배치가 다음 날 이어받는다.
 *   fail   사람이 손대야 하는 것. 키·활용신청·IP 차단처럼 재시도로는 안 풀린다.
 */

/** 오류를 어떻게 다룰 것인가. */
export type KrDataDisposition = 'retry' | 'quota' | 'fail';

export interface KrDataGatewayCode {
  /** 응답의 errMsg. 이 표의 식별자다. */
  readonly errMsg: string;

  /**
   * 응답의 returnReasonCode.
   *
   * **번호가 곧 식별자는 아니다.** 20 은 세 가지 errMsg 가 나눠 쓴다. 그래서 찾을 때는
   * errMsg 를 먼저 보고, 없을 때만 번호로 떨어진다.
   */
  readonly code: string;

  readonly disposition: KrDataDisposition;

  /**
   * 재시도 전 최소 대기(ms). 초당 한도처럼 **시간이 지나야** 풀리는 코드가 쓴다.
   * 지수 백오프가 이 값보다 짧으면 이 값으로 늘린다.
   */
  readonly minDelayMs?: number;

  /**
   * 서비스키가 원인일 수 있는 코드인가. 참이면 예외 메시지에 마스킹한 키 앞자리를 붙인다.
   *
   * 키를 여러 개 돌려 쓰면 "어느 키가 거부됐나" 를 알아야 손을 쓸 수 있다.
   */
  readonly keyRelated?: boolean;

  /** 예외 메시지에 붙는 한 줄. **영어로 쓴다** — 로그로 나가는 문장이다. */
  readonly summary: string;
}

/**
 * 포털이 공개한 공통오류코드 표.
 *
 * 순서는 번호순이다. 추가할 때도 번호 자리에 끼워 넣는다 — 표를 눈으로 훑을 때
 * 빠진 번호가 보여야 한다.
 *
 * 기관이 제 봉투(`resultCode`)로 주는 코드도 여기 담을 수 있다. 찾기는 errMsg·code 양쪽으로
 * 하므로, 예컨대 HIRA 의 `JDBC-12031` 이 반복되면 code 자리에 그대로 적으면 된다.
 */
export const KRDATA_GATEWAY_CODES: readonly KrDataGatewayCode[] = [
  {
    errMsg: 'APPLICATION_ERROR',
    code: '01',
    disposition: 'retry',
    summary: 'The gateway hit an unexpected internal error.',
  },
  {
    /*
      포털 안내문은 "요청 방식과 호출 URL 을 확인하라" 지만, 우리 요청 방식과 경로는
      생성된 코드가 고정으로 만든다. 그러니 이 코드가 뜨면 남는 원인은 안내문 앞쪽이 아니라
      뒤쪽 - "기관 API 응답 처리 실패" - 이고, 그쪽은 다시 부르면 풀리는 종류다.
    */
    errMsg: 'HTTP_ERROR',
    code: '04',
    disposition: 'retry',
    summary: 'The gateway rejected the HTTP request or failed to read the ministry response.',
  },
  {
    errMsg: 'SERVICETIMEOUT_ERROR',
    code: '05',
    disposition: 'retry',
    summary: 'The ministry API or a gateway link timed out.',
  },
  {
    /*
      표에는 "파라미터 값·형식 오류" 로 적혀 있으나 **우리 요청으로는 이 코드를 만들 수 없다.**
      유효한 키로 numOfRows 에 글자를 넣든, 정의에 없는 파라미터를 붙이든, ServiceKey 를
      두 번 보내든 전부 200 이 온다. (2026-09-15 실측)

      그런데도 hira·nmc·mois 가 같은 시각에 이 코드로 떨어진 적이 있다. 게이트웨이가
      제 사정을 이 번호로 흘리는 것으로 보고 재시도로 다룬다. 진짜 파라미터 문제였다면
      세 번 모두 같은 응답이라 결과는 달라지지 않는다.
    */
    errMsg: 'INVALID_REQUEST_PARAMETER_ERROR',
    code: '10',
    disposition: 'retry',
    summary: 'The gateway rejected a request parameter.',
  },
  {
    /*
      "서비스가 없거나 폐기" 라는 뜻이지만 살아 있는 경로에서도 뜬다. 2026-08-16~17 에
      codeInfoService/getAddrCodeList 가 이 코드로 아홉 번 떨어졌고, 같은 경로가 지금도
      정상이다. 10 과 같은 이유로 재시도한다.
    */
    errMsg: 'NO_OPENAPI_SERVICE_ERROR',
    code: '12',
    disposition: 'retry',
    summary: 'The gateway says the service path does not exist.',
  },
  {
    errMsg: 'SERVICE_KEY_IS_NULL',
    code: '20',
    disposition: 'fail',
    keyRelated: true,
    summary: 'The request carried no service key.',
  },
  {
    errMsg: 'PERMISSION_DENIED',
    code: '20',
    disposition: 'fail',
    keyRelated: true,
    summary: 'The gateway denied access to this request.',
  },
  {
    errMsg: 'SERVICE_ACCESS_DENIED_ERROR',
    code: '20',
    disposition: 'fail',
    keyRelated: true,
    summary: 'This key has no approved subscription for the service, or it is suspended.',
  },
  {
    errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
    code: '22',
    disposition: 'quota',
    summary: 'The daily call limit for this service is used up.',
  },
  {
    /*
      **22 와 다르다.** 이쪽은 초당 한도(30 TPS)라 잠깐 쉬면 풀린다. 하루치를 접으면 안 된다.
      이름이 22 와 비슷해 문자열로 가르면 틀린다 - 번호로 가른다.
    */
    errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR',
    code: '23',
    disposition: 'retry',
    minDelayMs: 1_000,
    summary: 'The per-second call limit was exceeded.',
  },
  {
    errMsg: 'BLACKLIST_IP_ACCESS_ERROR',
    code: '29',
    disposition: 'fail',
    summary: 'The caller IP is blocked.',
  },
  {
    errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
    code: '30',
    disposition: 'fail',
    keyRelated: true,
    summary: 'The service key is not registered for this service.',
  },
  {
    errMsg: 'DEADLINE_HAS_EXPIRED_ERROR',
    code: '31',
    disposition: 'fail',
    keyRelated: true,
    summary: 'The service key has passed its expiry date.',
  },
];

/** 판정 결과. 호출부가 보는 것은 이것뿐이다. */
export interface KrDataVerdict {
  readonly disposition: KrDataDisposition;

  /** 재시도 전 최소 대기(ms). 해당 없으면 0. */
  readonly minDelayMs: number;

  /** 서비스키를 메시지에 비칠 자리인가. */
  readonly keyRelated: boolean;

  /**
   * 표에서 찾은 코드인가.
   *
   * 거짓이면 포털이 표에 없는 코드를 보낸 것이다. 그대로 실패로 다루되 메시지에 남겨,
   * 같은 코드가 반복되면 이 표에 한 줄 추가하면 되게 한다.
   */
  readonly known: boolean;

  readonly summary?: string;
}

const BY_ERR_MSG = new Map(KRDATA_GATEWAY_CODES.map((entry) => [entry.errMsg, entry]));

/**
 * 번호만 아는 응답을 위한 보조 색인.
 *
 * **판정이 갈리는 번호는 담지 않는다.** 20 처럼 여러 errMsg 가 나눠 쓰는 번호라도 방침이
 * 같으면 답할 수 있지만, 갈리는 번호는 찍는 것보다 모른다고 하는 편이 낫다.
 */
const BY_CODE = buildCodeIndex();

function buildCodeIndex(): ReadonlyMap<string, KrDataGatewayCode> {
  const grouped = new Map<string, KrDataGatewayCode[]>();
  for (const entry of KRDATA_GATEWAY_CODES) {
    const bucket = grouped.get(entry.code);
    if (bucket) {
      bucket.push(entry);
    } else {
      grouped.set(entry.code, [entry]);
    }
  }

  const index = new Map<string, KrDataGatewayCode>();
  for (const [code, entries] of grouped) {
    const [first] = entries;
    if (entries.every((entry) => entry.disposition === first.disposition)) {
      index.set(code, first);
    }
  }
  return index;
}

/** 표에 없는 코드. 재시도로 호출량을 태우지 않도록 실패로 둔다. */
const UNKNOWN: KrDataVerdict = {
  disposition: 'fail',
  minDelayMs: 0,
  keyRelated: false,
  known: false,
};

/**
 * 실패 응답을 판정한다.
 *
 * 보는 순서가 곧 신뢰도 순서다.
 *  1. errMsg  — 가장 구체적이다. 같은 번호를 나눠 쓰는 코드를 여기서 가른다.
 *  2. code    — errMsg 가 없거나 표에 없을 때.
 *  3. body    — 봉투 없이 본문에만 사정이 적혀 오는 경우가 있다. (실측 2026-07)
 *  4. status  — 아무것도 못 읽었을 때의 마지막 단서.
 */
export function classifyKrDataFailure(input: {
  status?: number;
  code?: string;
  errMsg?: string;
  body?: string;
}): KrDataVerdict {
  const matched =
    (input.errMsg ? BY_ERR_MSG.get(input.errMsg) : undefined) ??
    (input.code ? BY_CODE.get(input.code) : undefined);

  if (matched) {
    return toVerdict(matched);
  }

  // 게이트웨이가 봉투 없이 본문으로만 한도 초과를 알리는 형태. ("API token quota exceeded")
  if (input.body !== undefined && /quota exceeded/i.test(input.body)) {
    return { disposition: 'quota', minDelayMs: 0, keyRelated: false, known: true };
  }

  return input.status === undefined ? UNKNOWN : fromStatus(input.status);
}

function toVerdict(entry: KrDataGatewayCode): KrDataVerdict {
  return {
    disposition: entry.disposition,
    minDelayMs: entry.minDelayMs ?? 0,
    keyRelated: entry.keyRelated ?? false,
    known: true,
    summary: entry.summary,
  };
}

/**
 * 상태코드만 보고 판정한다.
 *
 * 429 는 게이트웨이가 봉투를 안 씌우고 막는 자리라 한도로 본다. 5xx 는 원본 장애이므로
 * 재시도한다. 나머지 4xx 는 우리 요청이 틀린 것이니 다시 불러도 같다.
 */
function fromStatus(status: number): KrDataVerdict {
  if (status === 429) {
    return { disposition: 'quota', minDelayMs: 0, keyRelated: false, known: true };
  }
  if (status >= 500) {
    return { disposition: 'retry', minDelayMs: 0, keyRelated: false, known: true };
  }
  return {
    disposition: 'fail',
    minDelayMs: 0,
    keyRelated: status === 401 || status === 403,
    known: false,
  };
}
