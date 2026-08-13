import { RESULT_BAD_KEY, RESULT_EMPTY, RESULT_OK, SeoulDataError, toServiceName } from './error';

const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY = 3;

export const SEOUL_DATA_BASE_URL = 'http://openapi.seoul.go.kr:8088';

/** 서울열린데이터광장 설정 */
export interface SeoulDataConfig {
  /**
   * 서울열린데이터광장에서 발급받은 인증키.
   *
   * data.go.kr 과 달리 퍼센트 인코딩된 키가 아니라 영숫자 문자열이라 인코딩 걱정이 없다.
   * 스키마 확인용으로 `'sample'` 을 쓸 수 있으나 **한 번에 5건까지만** 준다(ERROR-335).
   */
  apiKey: string;

  /** API 베이스 URL. 바꿀 일이 없지만 테스트에서 갈아끼울 수 있게 열어둔다. */
  baseUrl?: string;

  readTimeoutMs?: number;
  maxRetry?: number;
}

/** 응답 봉투. orval 의 fetch 클라이언트가 mutator 반환값으로 기대하는 형태다. */
export interface SeoulDataResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export type SeoulDataFetch = (url: string, options?: RequestInit) => Promise<SeoulDataResponse>;

/**
 * 서울열린데이터광장 호출용 fetch 를 만든다. orval 의 custom mutator 로 주입한다.
 *
 * 생성된 코드가 만든 경로(/json/{SERVICE}/...)를 받아서 다음을 처리한다.
 *  - baseUrl + 인증키를 앞에 붙인다
 *  - 5xx·네트워크 오류 재시도
 *  - XML 로 오는 에러 감지
 *  - RESULT.CODE 검사
 */
export function createSeoulDataFetch(config: SeoulDataConfig): SeoulDataFetch {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new Error('SEOUL-DATA api key is not set');
  }

  const baseUrl = (config.baseUrl ?? SEOUL_DATA_BASE_URL).replace(/\/+$/, '');
  const readTimeoutMs = config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const maxRetry = config.maxRetry ?? DEFAULT_MAX_RETRY;

  return async function seoulDataFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<SeoulDataResponse> {
    // 인증키가 **경로**로 들어간다. data.go.kr(쿼리 ServiceKey=) 과 가장 다른 지점이다.
    const requestUrl = `${baseUrl}/${apiKey}${url}`;
    const service = toServiceName(url);

    const response = await sendWithRetry(requestUrl, options, { readTimeoutMs, maxRetry }, service);

    return {
      status: response.status,
      data: parseBody(response.body, service),
      headers: response.headers,
    };
  };
}

interface RawResponse {
  status: number;
  body: string;
  headers: Headers;
}

interface RetryOptions {
  readTimeoutMs: number;
  maxRetry: number;
}

/** 5xx 와 네트워크 오류만 재시도한다. 4xx 는 즉시 실패시킨다. */
async function sendWithRetry(
  requestUrl: string,
  options: RequestInit,
  retry: RetryOptions,
  service: string | undefined,
): Promise<RawResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retry.maxRetry; attempt++) {
    try {
      const response = await fetch(requestUrl, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
        signal: options.signal ?? AbortSignal.timeout(retry.readTimeoutMs),
      });

      const body = await response.text();

      if (response.status < 500) {
        if (!response.ok) {
          // 메시지에 requestUrl 을 넣지 않는다 — **거기 인증키가 있다.**
          throw new SeoulDataError(
            `SEOUL-DATA API returned non-OK response (status=${response.status}): ${body}`,
            String(response.status),
            { responseBody: body, service },
          );
        }
        return { status: response.status, body, headers: response.headers };
      }

      lastError = new SeoulDataError(
        `SEOUL-DATA API server error (status=${response.status})`,
        String(response.status),
        { responseBody: body, service },
      );
    } catch (error) {
      if (error instanceof SeoulDataError) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < retry.maxRetry) {
      await sleep(2 ** attempt * 200);
    }
  }

  throw new SeoulDataError(
    `SEOUL-DATA API request failed after ${retry.maxRetry} attempts`,
    'NETWORK',
    { cause: lastError, service },
  );
}

/**
 * 본문을 파싱하고 RESULT.CODE 를 검사한다.
 *
 * **에러가 두 가지 형태로 온다.** /json/ 으로 요청해도 그렇다. (2026-07 실측)
 *   ERROR-335  <RESULT><CODE>ERROR-335</CODE><MESSAGE><![CDATA[...]]></MESSAGE></RESULT>   ← XML
 *   ERROR-500  {"RESULT":{"CODE":"ERROR-500","MESSAGE":"서버 오류입니다."}}                  ← JSON
 * 하나만 보면 XML 이 온 순간 JSON.parse 가 터지면서 "Unexpected token <" 이라는,
 * 원인을 전혀 알려주지 않는 예외가 난다.
 *
 * 성공 응답은 서비스명을 키로 한 봉투 안에 RESULT 가 들어 있다.
 *   {"SearchSTNBySubwayLineInfo":{"list_total_count":799,"RESULT":{"CODE":"INFO-000",...},"row":[...]}}
 */
function parseBody(body: string, service: string | undefined): unknown {
  const trimmed = body.trimStart();

  if (trimmed.startsWith('<')) {
    const { code, message } = parseXmlResult(trimmed);
    throw new SeoulDataError(message ?? 'SEOUL-DATA API returned an XML error', code ?? 'XML', {
      responseBody: body,
      service,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new SeoulDataError('SEOUL-DATA API returned an unparseable body', 'PARSE', {
      cause: error,
      responseBody: body.slice(0, 500),
      service,
    });
  }

  const result = extractResult(parsed);
  if (!result) {
    return parsed;
  }

  // INFO-200(데이터 없음)은 에러가 아니다. 빈 결과를 그대로 통과시킨다. error.ts 참고.
  if (result.CODE === RESULT_OK || result.CODE === RESULT_EMPTY) {
    return parsed;
  }

  const hint = result.CODE === RESULT_BAD_KEY ? ' (인증키를 확인하라. 재시도해도 소용없다.)' : '';

  throw new SeoulDataError(
    `${result.MESSAGE ?? 'SEOUL-DATA API error'}${hint}`,
    result.CODE ?? 'UNKNOWN',
    { responseBody: body.slice(0, 500), service },
  );
}

interface ResultBlock {
  CODE?: string;
  MESSAGE?: string;
}

/**
 * RESULT 블록을 찾는다. 성공이면 서비스 봉투 **안**에, 에러면 **최상위**에 있다.
 * 어느 쪽이든 하나뿐이라 첫 번째로 찾은 걸 쓴다.
 */
function extractResult(parsed: unknown): ResultBlock | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const root = parsed as Record<string, unknown>;
  if (isResultBlock(root.RESULT)) {
    return root.RESULT;
  }

  for (const value of Object.values(root)) {
    if (value && typeof value === 'object') {
      const inner = (value as Record<string, unknown>).RESULT;
      if (isResultBlock(inner)) {
        return inner;
      }
    }
  }

  return undefined;
}

function isResultBlock(value: unknown): value is ResultBlock {
  return !!value && typeof value === 'object' && 'CODE' in value;
}

/**
 * XML 에러에서 CODE 와 MESSAGE 를 뽑는다.
 *
 * XML 파서를 의존성으로 들이지 않는다. 이 XML 은 에러 응답 하나뿐이고 구조가 고정이라
 * 정규식이면 충분하다. 정상 응답은 언제나 JSON 이다(경로에 /json/ 을 박아 뒀다).
 * MESSAGE 는 CDATA 로 감싸여 오기도 하고 아니기도 하다.
 */
function parseXmlResult(xml: string): { code?: string; message?: string } {
  const code = /<CODE>([^<]*)<\/CODE>/.exec(xml)?.[1]?.trim();
  const message = /<MESSAGE>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/MESSAGE>/.exec(xml)?.[1]?.trim();
  return { code, message };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
