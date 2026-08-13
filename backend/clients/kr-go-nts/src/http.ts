import { NtsError, STATUS_OK } from './error';

const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY = 3;

export const NTS_BASE_URL = 'https://api.odcloud.kr/api/nts-businessman/v1';

/** 국세청 사업자등록 API 설정 */
export interface NtsConfig {
  /**
   * 공공데이터포털(data.go.kr)에서 발급받은 서비스키.
   *
   * odcloud.kr 도 포털 인프라라 data.go.kr 와 같은 키다. 포털이 주는 **"Encoding" 키**
   * (`%2B`, `%3D` 등이 포함된 형태)를 그대로 넣는다. 이 값은 쿼리에 재인코딩 없이 붙는다 —
   * URL/URLSearchParams 로 다시 인코딩하면 `%2B` 가 `%252B` 가 되어 인증에 실패한다.
   */
  serviceKey: string;

  /** API 베이스 URL. 바꿀 일이 없지만 테스트에서 갈아끼울 수 있게 열어둔다. */
  baseUrl?: string;

  readTimeoutMs?: number;
  maxRetry?: number;
}

/** 응답 봉투. orval 의 fetch 클라이언트가 mutator 반환값으로 기대하는 형태다. */
export interface NtsResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export type NtsFetch = (url: string, options?: RequestInit) => Promise<NtsResponse>;

/**
 * 국세청 사업자등록 API 호출용 fetch 를 만든다. orval 의 custom mutator 로 주입한다.
 *
 * 생성된 코드가 만든 경로(/status, /validate + JSON 본문)를 받아서 다음을 처리한다.
 *  - baseUrl 접두 + serviceKey(쿼리) 주입
 *  - 5xx·네트워크 오류 재시도 (진위확인·상태조회는 읽기 전용이라 POST 여도 안전하다)
 *  - XML 로 오는 인증 에러 감지
 *  - status_code == 'OK' 검사
 */
export function createNtsFetch(config: NtsConfig): NtsFetch {
  const serviceKey = config.serviceKey?.trim();
  if (!serviceKey) {
    throw new Error('NTS service key is not set');
  }

  const baseUrl = (config.baseUrl ?? NTS_BASE_URL).replace(/\/+$/, '');
  const readTimeoutMs = config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const maxRetry = config.maxRetry ?? DEFAULT_MAX_RETRY;

  return async function ntsFetch(url: string, options: RequestInit = {}): Promise<NtsResponse> {
    // 발급키는 이미 퍼센트 인코딩된 문자열이라 문자열로 직접 이어 붙인다. (@krdata/core 와 같은 이유)
    const separator = url.includes('?') ? '&' : '?';
    const requestUrl = `${baseUrl}${url}${separator}serviceKey=${serviceKey}`;

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
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: options.signal ?? AbortSignal.timeout(retry.readTimeoutMs),
      });

      const body = await response.text();

      if (response.status < 500) {
        if (!response.ok) {
          // 메시지에 requestUrl 을 넣지 않는다 — **거기 serviceKey 가 있다.**
          throw new NtsError(
            `NTS API returned non-OK response (status=${response.status}): ${body}`,
            extractStatusCode(body) ?? String(response.status),
            { responseBody: body },
          );
        }
        return { status: response.status, body, headers: response.headers };
      }

      lastError = new NtsError(
        `NTS API server error (status=${response.status})`,
        String(response.status),
        { responseBody: body },
      );
    } catch (error) {
      if (error instanceof NtsError) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < retry.maxRetry) {
      await sleep(2 ** attempt * 200);
    }
  }

  throw new NtsError(`NTS API request failed after ${retry.maxRetry} attempts`, 'NETWORK', {
    cause: lastError,
  });
}

/**
 * 본문을 파싱하고 status_code 를 검사한다.
 *
 * 인증키 오류 등 일부 에러는 게이트웨이가 XML/HTML 로 내려주기도 한다. 본문이 '<' 로
 * 시작하면 그대로 예외로 바꾼다. 정상 응답은 언제나 JSON 이다.
 *
 * 성공 응답: { "status_code": "OK", "data": [ ... ], ... }
 */
function parseBody(body: string): unknown {
  const trimmed = body.trimStart();

  if (trimmed.startsWith('<')) {
    throw new NtsError('NTS API returned a non-JSON (XML/HTML) error', 'XML', {
      responseBody: body.slice(0, 500),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new NtsError('NTS API returned an unparseable body', 'PARSE', {
      cause: error,
      responseBody: body.slice(0, 500),
    });
  }

  const statusCode = readStatusCode(parsed);
  // status_code 가 없으면 우리가 모르는 모양이다. 판단하지 말고 원본을 통과시킨다.
  if (statusCode === undefined || statusCode === STATUS_OK) {
    return parsed;
  }

  throw new NtsError(`NTS API returned a non-OK status: ${statusCode}`, statusCode, {
    responseBody: body.slice(0, 500),
  });
}

function readStatusCode(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const value = (parsed as Record<string, unknown>).status_code;
  return typeof value === 'string' ? value : undefined;
}

/** 에러 본문(JSON)에서 status_code 를 뽑는다. 없으면 undefined. */
function extractStatusCode(body: string): string | undefined {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }
  try {
    return readStatusCode(JSON.parse(body));
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
