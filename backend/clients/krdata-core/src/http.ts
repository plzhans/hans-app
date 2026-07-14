import {
  KrDataConfig,
  maskServiceKey,
  resolveConfig,
  ResolvedKrDataConfig,
} from './config';
import { isQuotaExceeded, KrDataError, KrDataQuotaError } from './error';
import { extractResultHeader, normalizeKrDataResponse } from './normalize';

/**
 * 응답 봉투. orval 의 fetch 클라이언트가 mutator 반환값으로 기대하는 형태다.
 */
export interface KrDataResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export type KrDataFetch = (
  url: string,
  options?: RequestInit,
) => Promise<KrDataResponse>;

/**
 * 공공데이터포털 호출용 fetch 를 만든다. orval 의 custom mutator 로 주입한다.
 *
 * 생성된 코드가 만든 URL(path + 쿼리)을 받아서 다음을 처리한다.
 *  - baseUrl 접두
 *  - ServiceKey / _type=json 주입
 *  - 5xx·네트워크 오류 재시도
 *  - XML 에러 응답 감지
 *  - resultCode 검사 및 items 정규화
 */
export function createKrDataFetch(config: KrDataConfig): KrDataFetch {
  const resolved = resolveConfig(config);

  return async function krDataFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<KrDataResponse> {
    const requestUrl = buildUrl(resolved, url);
    const response = await sendWithRetry(resolved, requestUrl, options);
    return {
      status: response.status,
      data: parseBody(resolved, requestUrl, response.body),
      headers: response.headers,
    };
  };
}

/**
 * 발급받은 서비스키는 이미 퍼센트 인코딩된 문자열("Encoding" 키)이라 다시 인코딩하면 안 된다.
 * `%2B` 가 `%252B` 가 되어 401 이 난다. URL/URLSearchParams 는 이를 재인코딩하므로
 * 여기서는 문자열로 직접 이어 붙인다. 나머지 파라미터는 생성된 코드가 이미 인코딩해서 넘겨준다.
 *
 * `_type=json` 을 주지 않으면 XML 로 응답한다.
 */
function buildUrl(config: ResolvedKrDataConfig, url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${config.baseUrl}${url}${separator}ServiceKey=${config.serviceKey}&_type=json`;
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

interface RawResponse {
  status: number;
  body: string;
  headers: Headers;
}

/** 5xx 와 네트워크 오류만 재시도한다. 4xx 는 재시도하지 않고 즉시 실패시킨다. */
async function sendWithRetry(
  config: ResolvedKrDataConfig,
  requestUrl: string,
  options: RequestInit,
): Promise<RawResponse> {
  const endpoint = toEndpoint(requestUrl);
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
        if (response.status === 401) {
          throw new KrDataError(
            `KR-DATA API unauthorized (status=401), service key: ${maskServiceKey(config.serviceKey)}`,
            '401',
            { responseBody: body, endpoint },
          );
        }
        if (!response.ok) {
          // 403 은 한도가 아니라 **권한 거부**다. 키마다 API 별로 활용신청·승인이 따로라,
          // 어느 키로 거부됐는지 모르면 원인을 못 짚는다. 키 앞 5글자를 함께 남긴다.
          const who =
            response.status === 403
              ? ` (service key: ${maskServiceKey(config.serviceKey)})`
              : '';
          const message = `KR-DATA API returned non-OK response (status=${response.status})${who}: ${body}`;

          // 한도 초과는 **HTTP 429** 로도 온다 ("API token quota exceeded").
          // 실측(2026-07)에서 이 경로로 왔다. resultCode 22 만 보면 놓친다.
          // 장애가 아니라 "오늘은 여기까지"이므로 따로 구분한다. 재시도하지 않는다(콜만 버린다).
          if (isQuotaExceeded(String(response.status), body)) {
            throw new KrDataQuotaError(
              message,
              String(response.status),
              body,
              endpoint,
            );
          }

          throw new KrDataError(message, String(response.status), {
            responseBody: body,
            endpoint,
          });
        }
        return { status: response.status, body, headers: response.headers };
      }

      lastError = new KrDataError(
        `KR-DATA API returned non-OK response (status=${response.status}): ${body}`,
        String(response.status),
        { responseBody: body, endpoint },
      );
    } catch (error) {
      // 4xx 로 이미 판정한 에러는 재시도하지 않는다.
      if (error instanceof KrDataError) {
        throw error;
      }
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new KrDataError(
      `KR-DATA API request failed after ${config.maxRetry} attempts: ${lastError.message}`,
      'UNKNOWN',
      { cause: lastError, endpoint },
    );
  }
  throw new KrDataError(
    `KR-DATA API request failed after ${config.maxRetry} attempts`,
    'UNKNOWN',
    { endpoint },
  );
}

function parseBody(
  config: ResolvedKrDataConfig,
  requestUrl: string,
  body: string,
): unknown {
  const endpoint = toEndpoint(requestUrl);

  // _type=json 을 줘도 서비스키 오류 등 일부 에러는 XML 로 온다.
  if (body.trimStart().startsWith('<')) {
    const code = extractXmlErrorCode(body);
    const message = `KR-DATA API returned an XML error: ${extractXmlErrorMessage(body)} (service key: ${maskServiceKey(config.serviceKey)})`;

    // 한도 초과는 XML 로도 온다. 장애가 아니라 "오늘은 여기까지"라서 따로 구분한다.
    if (isQuotaExceeded(code, body)) {
      throw new KrDataQuotaError(message, code, body, endpoint);
    }

    throw new KrDataError(message, code, { responseBody: body, endpoint });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new KrDataError(
      'Failed to parse KR-DATA API response',
      'PARSE_ERROR',
      {
        cause: error,
        responseBody: body,
        endpoint,
      },
    );
  }

  const header = extractResultHeader(payload);
  if (header?.resultCode !== undefined && header.resultCode !== '00') {
    const message = `KR-DATA API returned an error: ${header.resultMsg ?? 'unknown'}`;

    // 한도 초과는 장애가 아니다. 배치가 "오늘은 여기까지"로 다룰 수 있게 따로 구분한다.
    if (isQuotaExceeded(header.resultCode, body)) {
      throw new KrDataQuotaError(message, header.resultCode, body, endpoint);
    }

    throw new KrDataError(message, header.resultCode, {
      responseBody: body,
      endpoint,
    });
  }

  normalizeKrDataResponse(payload);
  return payload;
}

function extractXmlErrorMessage(body: string): string {
  return (
    matchTag(body, 'returnAuthMsg') ??
    matchTag(body, 'errMsg') ??
    matchTag(body, 'resultMsg') ??
    body.slice(0, 200)
  );
}

function extractXmlErrorCode(body: string): string {
  return (
    matchTag(body, 'returnReasonCode') ??
    matchTag(body, 'resultCode') ??
    'XML_ERROR'
  );
}

function matchTag(body: string, tag: string): string | undefined {
  return (
    new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(body)?.[1]?.trim() || undefined
  );
}
