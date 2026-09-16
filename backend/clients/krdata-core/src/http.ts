import { KrDataConfig, maskServiceKey, resolveConfig, ResolvedKrDataConfig } from './config';
import { KrDataError, KrDataQuotaError } from './error';
import { classifyKrDataFailure, KrDataVerdict } from './gateway-code';
import { acquireCallSlot } from './rate-limit';

/**
 * 응답 봉투. orval 의 fetch 클라이언트가 mutator 반환값으로 기대하는 형태다.
 */
export interface KrDataResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export type KrDataFetch = (url: string, options?: RequestInit) => Promise<KrDataResponse>;

/**
 * 공공데이터포털 호출용 fetch 를 만든다. orval 의 custom mutator 로 주입한다.
 *
 * 생성된 코드가 만든 URL(path + 쿼리)을 받아서 다음을 처리한다.
 *  - baseUrl 접두
 *  - ServiceKey / _type=json 주입
 *  - 응답 해석(HTTP 상태·게이트웨이 봉투·부처 봉투)과 오류 판정
 *  - 판정이 retry 인 오류의 재시도
 */
export function createKrDataFetch(config: KrDataConfig): KrDataFetch {
  const resolved = resolveConfig(config);

  return async function krDataFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<KrDataResponse> {
    return send(resolved, buildUrl(resolved, url), options);
  };
}

/**
 * 발급받은 서비스키는 이미 퍼센트 인코딩된 문자열("Encoding" 키)이라 다시 인코딩하면 안 된다.
 * `%2B` 가 `%252B` 가 되어 401 이 난다. URL/URLSearchParams 는 이를 재인코딩하므로
 * 여기서는 문자열로 직접 이어 붙인다. 나머지 파라미터는 생성된 코드가 이미 인코딩해서 넘겨준다.
 *
 * 포맷 파라미터를 주지 않으면 XML 로 응답한다. 이름은 부처마다 다르다(`_type` / `type`).
 */
function buildUrl(config: ResolvedKrDataConfig, url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  const { name, value } = config.envelope.formatParam;
  return `${config.baseUrl}${url}${separator}ServiceKey=${config.serviceKey}&${name}=${value}`;
}

/**
 * 실패 메시지에 쓸 API 이름. "MadmDtlInfoService2.7/getTrnsprtInfo2.7"
 *
 * 쿼리는 통째로 버린다 — **서비스키가 거기 있다.** 에러 메시지는 로그·DB(sync_state.error)에
 * 그대로 남으므로 키가 섞이면 유출이다.
 */
function toEndpoint(url: string): string {
  const path = url.split('?')[0] ?? url;
  return path.split('/').filter(Boolean).slice(-2).join('/');
}

/**
 * 실패를 예외로 만들기 전 단계.
 *
 * **바로 던지지 않는 이유는 재시도 때문이다.** 시도 횟수를 알아야 메시지를 완성할 수 있는데,
 * 그건 루프만 안다. 해석하는 쪽은 사실만 모아 넘기고 예외는 루프가 만든다.
 */
interface KrDataFailure {
  readonly message: string;
  readonly code: string;
  readonly verdict: KrDataVerdict;
  readonly responseBody?: string;
  readonly cause?: unknown;

  /** 응답이 어떤 상태로 왔나. 네트워크 오류로 응답 자체가 없으면 비어 있다. */
  readonly httpStatus?: number;
  /** 진단에 쓸 응답 헤더만 추린 한 줄. */
  readonly responseHeaders?: string;
}

/**
 * 한 번 부르고, 판정이 retry 면 다시 부른다.
 *
 * **해석까지 루프 안에 있다.** 게이트웨이 오류는 HTTP 200 으로도 오기 때문이다 — 본문을
 * 읽고 나서야 실패인 줄 아는 응답을 루프 밖에서 해석하면 재시도 대상이 아예 되지 못한다.
 */
async function send(
  config: ResolvedKrDataConfig,
  requestUrl: string,
  options: RequestInit,
): Promise<KrDataResponse> {
  const endpoint = toEndpoint(requestUrl);
  let failure: KrDataFailure | undefined;

  for (let attempt = 1; attempt <= config.maxRetry; attempt++) {
    failure = undefined;

    /*
      **나가기 전에 초당 자리를 얻는다.** 게이트웨이가 초당 50 에서 거절하는데(코드 23),
      워커 여럿이 개별 상세를 연달아 부르면 그 선을 쉽게 넘는다. 재시도 안에 두는 것은
      재시도도 한 번의 호출이기 때문이다 — 429 를 맞고 다시 부르는 요청이 창을 안 세면
      막으려던 그 상황을 그대로 다시 만든다.
    */
    await acquireCallSlot();

    try {
      const response = await fetch(requestUrl, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
        signal: options.signal ?? AbortSignal.timeout(config.readTimeoutMs),
      });

      const body = await response.text();
      const result = interpret(config, response.status, body);

      if (!('failure' in result)) {
        return { status: response.status, data: result.data, headers: response.headers };
      }
      /*
        **상태코드와 헤더를 실패에 실어 둔다.** 본문의 코드만으로는 게이트웨이가 정책으로
        거절한 것인지 인프라가 흔들린 것인지 갈리지 않는다 — 같은 본문이 200 으로도
        5xx 로도 온다.
      */
      failure = {
        ...result.failure,
        httpStatus: response.status,
        responseHeaders: diagnosticHeaders(response.headers),
      };
    } catch (error) {
      // 네트워크 오류·타임아웃. 원본이 답을 못 준 것이라 다시 불러 볼 값어치가 있다.
      failure = {
        message: `KR-DATA API request failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'UNKNOWN',
        verdict: { disposition: 'retry', minDelayMs: 0, keyRelated: false, known: false },
        cause: error,
      };
    }

    if (failure.verdict.disposition !== 'retry' || attempt === config.maxRetry) {
      throw toError(failure, endpoint, attempt);
    }
    await sleep(delayFor(config, failure.verdict, attempt));
  }

  /* 루프는 반드시 반환하거나 던진다. maxRetry 가 0 이하일 수 없도록 resolveConfig 가 막는다. */
  throw toError(
    failure ?? {
      message: 'KR-DATA API request failed without a response',
      code: 'UNKNOWN',
      verdict: { disposition: 'fail', minDelayMs: 0, keyRelated: false, known: false },
    },
    endpoint,
    config.maxRetry,
  );
}

/**
 * 진단에 쓸 응답 헤더만 추린다.
 *
 * **통째로 담지 않는다.** 헤더에는 쿠키 같은 것이 섞일 수 있고, 로그와 DB 에 그대로 남는다.
 * 게이트웨이가 거절 이유를 싣는 자리(`retry-after`·`x-*`)와 어느 장비가 답했는지를 말하는
 * 자리(`server`·`via`·`date`)만 본다.
 */
function diagnosticHeaders(headers: Headers): string {
  const wanted = ['date', 'server', 'via', 'content-type', 'retry-after', 'connection'];
  const picked: string[] = [];
  headers.forEach((value, name) => {
    if (wanted.includes(name) || name.startsWith('x-')) {
      picked.push(`${name}=${value}`);
    }
  });
  return picked.join(' ');
}

/** 지수 백오프. 코드가 요구하는 최소 대기가 더 길면 그쪽을 따른다. */
function delayFor(config: ResolvedKrDataConfig, verdict: KrDataVerdict, attempt: number): number {
  const backoff = config.retryDelayMs * 2 ** (attempt - 1);
  return Math.min(Math.max(backoff, verdict.minDelayMs), MAX_RETRY_DELAY_MS);
}

/** 백오프 상한. maxRetry 를 크게 잡아도 한 콜이 분 단위로 늘어지지 않게 막는다. */
const MAX_RETRY_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toError(failure: KrDataFailure, endpoint: string, attempts: number): KrDataError {
  /*
    **상태코드를 한 줄에 넣는다.** 이력 표(sync_state.error)에는 이 문자열만 남아서,
    상태가 빠지면 나중에 되짚을 때 게이트웨이 거절과 인프라 장애를 구별할 수 없다.
  */
  const http = failure.httpStatus === undefined ? '' : ` [HTTP ${failure.httpStatus}]`;
  const message =
    attempts > 1
      ? `${failure.message}${http} (after ${attempts} attempts)`
      : `${failure.message}${http}`;

  if (failure.verdict.disposition === 'quota') {
    return new KrDataQuotaError(
      message,
      failure.code,
      failure.responseBody,
      endpoint,
      failure.httpStatus,
      failure.responseHeaders,
    );
  }
  return new KrDataError(message, failure.code, {
    cause: failure.cause,
    responseBody: failure.responseBody,
    endpoint,
    disposition: failure.verdict.disposition,
    httpStatus: failure.httpStatus,
    responseHeaders: failure.responseHeaders,
  });
}

/**
 * 응답 하나를 읽어 성공이면 페이로드를, 실패면 사실 묶음을 돌려준다.
 *
 * 실패는 세 층에서 나온다. 층마다 형식이 다를 뿐 판정은 한 표가 한다.
 *  1. 게이트웨이 봉투 — `OpenAPI_ServiceResponse.cmmMsgHeader`. **JSON 으로도 XML 로도,
 *     HTTP 200 으로도 4xx 로도 온다.** 그래서 상태코드를 보기 전에 본문부터 본다.
 *  2. HTTP 상태 — 봉투를 못 읽었을 때의 단서.
 *  3. 부처 봉투 — `response.header.resultCode`. 성공 코드는 부처마다 다르다.
 */
function interpret(
  config: ResolvedKrDataConfig,
  status: number,
  body: string,
): { data: unknown } | { failure: KrDataFailure } {
  const isXml = body.trimStart().startsWith('<');
  const gateway = isXml ? readXmlError(body) : readJsonGatewayError(body);

  if (gateway) {
    const verdict = classifyKrDataFailure({
      status,
      code: gateway.code,
      errMsg: gateway.errMsg,
      body,
    });
    return {
      failure: {
        message: describe(config, gateway, verdict),
        code: gateway.code,
        verdict,
        responseBody: body,
      },
    };
  }

  if (isXml) {
    // 봉투로 못 읽은 XML. 게이트웨이가 아닌 무언가가 답한 것이라 본문 앞부분만 남긴다.
    const verdict = classifyKrDataFailure({ status, body });
    return {
      failure: {
        message: `KR-DATA API returned an unreadable XML response: ${body.slice(0, 200)}`,
        code: 'XML_ERROR',
        verdict,
        responseBody: body,
      },
    };
  }

  if (status < 200 || status >= 300) {
    const verdict = classifyKrDataFailure({ status, body });
    const who = verdict.keyRelated ? ` (service key: ${maskServiceKey(config.serviceKey)})` : '';
    return {
      failure: {
        message: `KR-DATA API returned non-OK response (status=${status})${who}: ${body.slice(0, 500)}`,
        code: String(status),
        verdict,
        responseBody: body,
      },
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    return {
      failure: {
        message: 'Failed to parse KR-DATA API response',
        code: 'PARSE_ERROR',
        verdict: { disposition: 'fail', minDelayMs: 0, keyRelated: false, known: false },
        responseBody: body,
        cause: error,
      },
    };
  }

  const header = config.envelope.readHeader(payload);
  if (header?.resultCode !== undefined && !config.envelope.isSuccess(header.resultCode)) {
    const verdict = classifyKrDataFailure({ code: header.resultCode, body });
    return {
      failure: {
        message: `KR-DATA API returned an error: ${header.resultMsg ?? 'unknown'}`,
        code: header.resultCode,
        verdict,
        responseBody: body,
      },
    };
  }

  config.envelope.normalize(payload);
  return { data: payload };
}

/** 게이트웨이 오류 한 줄. 표에 있는 코드면 우리 설명을, 없으면 원본 문구를 쓴다. */
function describe(
  config: ResolvedKrDataConfig,
  gateway: GatewayError,
  verdict: KrDataVerdict,
): string {
  const detail = verdict.summary ?? gateway.detail;
  const unknown = verdict.known ? '' : ' — not in the known gateway code table';
  const who = verdict.keyRelated ? ` (service key: ${maskServiceKey(config.serviceKey)})` : '';
  return `KR-DATA API returned a gateway error: ${gateway.errMsg} (code ${gateway.code}) ${detail}${unknown}${who}`;
}

interface GatewayError {
  readonly code: string;
  readonly errMsg: string;
  /** 원본이 준 한국어 안내(returnAuthMsg). 표에 없는 코드일 때 유일한 단서다. */
  readonly detail: string;
}

/**
 * 게이트웨이가 JSON 으로 준 오류. 정상 응답이면 undefined.
 *
 *   {"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":…,"returnAuthMsg":…,"returnReasonCode":…}}}
 *
 * **HTTP 200 으로도 온다.** 상태코드만 보면 인증 실패가 정상 응답으로 통과해 빈 결과처럼 보인다.
 */
function readJsonGatewayError(body: string): GatewayError | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return undefined;
  }

  const envelope = asRecord(asRecord(payload)?.OpenAPI_ServiceResponse);
  const header = asRecord(envelope?.cmmMsgHeader);
  if (!header) {
    return undefined;
  }

  return {
    code: asText(header.returnReasonCode) ?? 'GATEWAY_ERROR',
    errMsg: asText(header.errMsg) ?? 'UNKNOWN',
    detail: asText(header.returnAuthMsg) ?? '',
  };
}

/** `_type=json` 을 줘도 일부 오류는 XML 로 온다. 태그 이름은 JSON 과 같다. */
function readXmlError(body: string): GatewayError | undefined {
  const code = matchTag(body, 'returnReasonCode') ?? matchTag(body, 'resultCode');
  const errMsg = matchTag(body, 'errMsg');
  if (!code && !errMsg) {
    return undefined;
  }
  return {
    code: code ?? 'XML_ERROR',
    errMsg: errMsg ?? 'UNKNOWN',
    detail: matchTag(body, 'returnAuthMsg') ?? matchTag(body, 'resultMsg') ?? '',
  };
}

function matchTag(body: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(body)?.[1]?.trim() || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** 원시값이면 문자열로, 아니면 undefined. 객체가 섞여 와도 "[object Object]" 를 남기지 않는다. */
function asText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}
