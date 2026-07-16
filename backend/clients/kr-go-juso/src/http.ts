import { ERROR_BAD_KEY, ERROR_OK, JusoError } from './error';

const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY = 3;

export const JUSO_BASE_URL = 'https://business.juso.go.kr/addrlink';

/** 도로명주소 개발자센터 설정 */
export interface JusoConfig {
  /**
   * 도로명주소 개발자센터에서 발급받은 **검색 API 승인키**(confmKey).
   *
   * data.go.kr(ServiceKey)·서울열린데이터광장(경로 키)과 이름도 위치도 다르다.
   * 영숫자 문자열이라 인코딩 걱정은 없다. 쿼리로 붙는다.
   * **키 종류가 여러 개다** — 검색 API 승인키가 아니면 E0001 로 거부된다.
   */
  confmKey: string;

  /** API 베이스 URL. 바꿀 일이 없지만 테스트에서 갈아끼울 수 있게 열어둔다. */
  baseUrl?: string;

  readTimeoutMs?: number;
  maxRetry?: number;
}

/** 응답 봉투. orval 의 fetch 클라이언트가 mutator 반환값으로 기대하는 형태다. */
export interface JusoResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export type JusoFetch = (
  url: string,
  options?: RequestInit,
) => Promise<JusoResponse>;

/**
 * 도로명주소 API 호출용 fetch 를 만든다. orval 의 custom mutator 로 주입한다.
 *
 * 생성된 코드가 만든 경로(/addrEngApi.do?currentPage=...)를 받아서 다음을 처리한다.
 *  - baseUrl 접두 + confmKey / resultType=json 주입
 *  - 5xx·네트워크 오류 재시도
 *  - XML 로 오는 에러 감지
 *  - results.common.errorCode 검사
 */
export function createJusoFetch(config: JusoConfig): JusoFetch {
  const confmKey = config.confmKey?.trim();
  if (!confmKey) {
    throw new Error('JUSO confmKey is not set');
  }

  const baseUrl = (config.baseUrl ?? JUSO_BASE_URL).replace(/\/+$/, '');
  const readTimeoutMs = config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const maxRetry = config.maxRetry ?? DEFAULT_MAX_RETRY;

  return async function jusoFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<JusoResponse> {
    // 생성된 코드가 이미 쿼리(? 포함)를 붙여 넘긴다. confmKey·resultType 만 더한다.
    // resultType 은 항상 json 으로 고정한다 — 스펙에 노출하지 않는 이유는 openapi 주석 참고.
    const separator = url.includes('?') ? '&' : '?';
    const requestUrl = `${baseUrl}${url}${separator}confmKey=${confmKey}&resultType=json`;

    const response = await sendWithRetry(requestUrl, options, {
      readTimeoutMs,
      maxRetry,
    });

    return {
      status: response.status,
      data: parseBody(response.body),
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
          // 메시지에 requestUrl 을 넣지 않는다 — **거기 confmKey 가 있다.**
          throw new JusoError(
            `JUSO API returned non-OK response (status=${response.status}): ${body}`,
            String(response.status),
            { responseBody: body },
          );
        }
        return { status: response.status, body, headers: response.headers };
      }

      lastError = new JusoError(
        `JUSO API server error (status=${response.status})`,
        String(response.status),
        { responseBody: body },
      );
    } catch (error) {
      if (error instanceof JusoError) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < retry.maxRetry) {
      await sleep(2 ** attempt * 200);
    }
  }

  throw new JusoError(
    `JUSO API request failed after ${retry.maxRetry} attempts`,
    'NETWORK',
    { cause: lastError },
  );
}

/**
 * 본문을 파싱하고 results.common.errorCode 를 검사한다.
 *
 * resultType=json 을 줘도 일부 에러는 XML 로 올 수 있어(다른 juso 소비자에서 실측된 패턴),
 * 본문이 '<' 로 시작하면 XML 에러로 판정한다. 정상 응답은 언제나 JSON 이다.
 *
 * 성공 응답: { "results": { "common": { "errorCode": "0", ... }, "juso": [ ... ] } }
 * 결과가 없어도 errorCode 는 '0' 이다(juso 가 null). 에러가 아니므로 그대로 통과시킨다.
 */
function parseBody(body: string): unknown {
  const trimmed = body.trimStart();

  if (trimmed.startsWith('<')) {
    const { code, message } = parseXmlError(trimmed);
    throw new JusoError(
      message ?? 'JUSO API returned an XML error',
      code ?? 'XML',
      { responseBody: body.slice(0, 500) },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new JusoError('JUSO API returned an unparseable body', 'PARSE', {
      cause: error,
      responseBody: body.slice(0, 500),
    });
  }

  const common = extractCommon(parsed);
  // common 이 없으면 우리가 모르는 모양이다. 판단하지 말고 원본을 통과시킨다.
  if (
    !common ||
    common.errorCode === undefined ||
    common.errorCode === ERROR_OK
  ) {
    return parsed;
  }

  const hint = ERROR_BAD_KEY.has(common.errorCode)
    ? ' (검색 API 승인키를 확인하라. 재시도해도 소용없다.)'
    : '';

  throw new JusoError(
    `${common.errorMessage ?? 'JUSO API error'}${hint}`,
    common.errorCode,
    { responseBody: body.slice(0, 500) },
  );
}

interface CommonBlock {
  errorCode?: string;
  errorMessage?: string;
}

function extractCommon(parsed: unknown): CommonBlock | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const results = (parsed as Record<string, unknown>).results;
  if (!results || typeof results !== 'object') {
    return undefined;
  }
  const common = (results as Record<string, unknown>).common;
  if (!common || typeof common !== 'object') {
    return undefined;
  }
  return common;
}

/**
 * XML 에러에서 code 와 message 를 뽑는다.
 *
 * XML 파서를 의존성으로 들이지 않는다 — 에러 응답 하나뿐이고 구조가 고정이라 정규식이면 충분하다.
 * 정상 응답은 언제나 JSON 이다(resultType=json 을 mutator 가 박는다).
 */
function parseXmlError(xml: string): { code?: string; message?: string } {
  const code = /<errorCode>([^<]*)<\/errorCode>/.exec(xml)?.[1]?.trim();
  const message =
    /<errorMessage>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/errorMessage>/
      .exec(xml)?.[1]
      ?.trim();
  return { code, message };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
