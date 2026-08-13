import {
  isAuthError,
  isQuotaExceeded,
  VworldAuthError,
  VworldError,
  VworldQuotaError,
} from './error';

const DEFAULT_READ_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRY = 3;

export const VWORLD_BASE_URL = 'https://api.vworld.kr';

/** 브이월드 API 설정 */
export interface VworldConfig {
  /**
   * 브이월드에서 발급받은 인증키.
   *
   * **공공데이터포털 서비스키와 별개다.** vworld.kr 에서 따로 받는다.
   * 값이 UUID 형태라 퍼센트 인코딩 문제가 없다 — @krdata 와 달리 그냥 인코딩해서 붙여도 된다.
   */
  serviceKey: string;

  /** API 베이스 URL. 바꿀 일이 없지만 테스트에서 갈아끼울 수 있게 열어둔다. */
  baseUrl?: string;

  readTimeoutMs?: number;
  maxRetry?: number;
}

/** 응답 봉투. orval 의 fetch 클라이언트가 mutator 반환값으로 기대하는 형태다. */
export interface VworldResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export type VworldFetch = (url: string, options?: RequestInit) => Promise<VworldResponse>;

/**
 * 브이월드 호출용 fetch 를 만든다. orval 의 custom mutator 로 주입한다.
 *
 * 생성된 코드가 만든 쿼리를 받아서 다음을 처리한다.
 *  - baseUrl 접두 + key·service·request·version·format 주입
 *  - 5xx·네트워크 오류 재시도
 *  - status 검사 (OK 가 아니면 예외). NOT_FOUND 는 예외가 아니다.
 *
 * **request 는 호출부가 정한다.** 같은 경로에서 오퍼레이션이 갈리기 때문이다.
 */
export function createVworldFetch(config: VworldConfig, operation: string): VworldFetch {
  const serviceKey = config.serviceKey?.trim();
  if (!serviceKey) {
    throw new Error('VWORLD service key is not set');
  }

  const baseUrl = (config.baseUrl ?? VWORLD_BASE_URL).replace(/\/+$/, '');
  const readTimeoutMs = config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const maxRetry = config.maxRetry ?? DEFAULT_MAX_RETRY;

  return async function vworldFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<VworldResponse> {
    const requestUrl = buildUrl(baseUrl, url, serviceKey, operation);
    const response = await sendWithRetry(requestUrl, options, {
      readTimeoutMs,
      maxRetry,
      operation,
    });

    return {
      status: response.status,
      data: parseBody(response.body, operation),
      headers: response.headers,
    };
  };
}

/**
 * 고정 파라미터를 붙인다.
 *
 * **인증키를 스펙에 넣지 않는 이유**는 @krdata 와 같다 — 생성된 코드가 다루면 로그·에러에
 * 섞여 나갈 수 있고, 값이 매 호출 같아서 스펙에 있을 이유가 없다.
 * service·version·format 도 고정값이라 여기서 붙인다.
 */
function buildUrl(baseUrl: string, url: string, serviceKey: string, operation: string): string {
  const separator = url.includes('?') ? '&' : '?';
  const fixed = new URLSearchParams({
    service: 'address',
    request: operation,
    version: '2.0',
    format: 'json',
    key: serviceKey,
  });
  return `${baseUrl}${url}${separator}${fixed.toString()}`;
}

interface RawResponse {
  status: number;
  body: string;
  headers: Headers;
}

/** 5xx 와 네트워크 오류만 재시도한다. 4xx 는 즉시 실패시킨다. */
async function sendWithRetry(
  requestUrl: string,
  options: RequestInit,
  config: { readTimeoutMs: number; maxRetry: number; operation: string },
): Promise<RawResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetry; attempt++) {
    try {
      const response = await fetch(requestUrl, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
        signal: options.signal ?? AbortSignal.timeout(config.readTimeoutMs),
      });

      const body = await response.text();

      if (response.status < 500) {
        if (!response.ok) {
          // **URL 을 메시지에 넣지 않는다 — 인증키가 쿼리에 있다.**
          throw new VworldError(
            `VWORLD API returned non-OK response (status=${response.status})`,
            String(response.status),
            { responseBody: body, operation: config.operation },
          );
        }
        return { status: response.status, body, headers: response.headers };
      }

      lastError = new VworldError(
        `VWORLD API returned non-OK response (status=${response.status})`,
        String(response.status),
        { responseBody: body, operation: config.operation },
      );
    } catch (error) {
      if (error instanceof VworldError) {
        throw error;
      }
      lastError = error;
    }
  }

  const suffix = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new VworldError(
    `VWORLD API request failed after ${config.maxRetry} attempts${suffix}`,
    'UNKNOWN',
    { cause: lastError, operation: config.operation },
  );
}

/**
 * 본문을 파싱하고 status 를 검사한다.
 *
 * **에러가 HTTP 200 으로 온다.** 상태코드로는 실패를 알 수 없어 본문의 status 를 봐야 한다.
 * NOT_FOUND 는 에러가 아니다 — "그 주소를 못 찾았다"는 정상 결과라 그대로 통과시키고,
 * 호출부가 빈 결과로 다룬다.
 */
function parseBody(body: string, operation: string): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new VworldError('Failed to parse VWORLD API response', 'PARSE_ERROR', {
      cause: error,
      responseBody: body,
      operation,
    });
  }

  const response = asRecord(asRecord(payload)?.response);
  const status = response?.status;
  if (status !== 'ERROR') {
    return payload;
  }

  const error = asRecord(response?.error);
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN_ERROR';
  const text = typeof error?.text === 'string' ? error.text : 'unknown';
  const level = typeof error?.level === 'string' ? error.level : undefined;
  const message = `VWORLD API returned an error: ${text}`;

  if (isQuotaExceeded(code)) {
    throw new VworldQuotaError(message, { operation, responseBody: body });
  }
  if (isAuthError(code)) {
    throw new VworldAuthError(message, code, { operation, responseBody: body });
  }
  throw new VworldError(message, code, {
    level,
    operation,
    responseBody: body,
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
