import { HiraWebError } from './error';

const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY = 3;

/** 기관당 최소 간격. 공개 API 가 아니라 웹 프런트다 — 기본값을 0 으로 두지 않는다. */
const DEFAULT_MIN_INTERVAL_MS = 1_000;

export const HIRA_WEB_BASE_URL = 'https://www.hira.or.kr';

/**
 * 심평원이 홈페이지에 심어 둔 UA 검사는 없다(2026-07 실측). 그래도 브라우저 UA 를 그대로 보낸다 —
 * 서버 로그에서 정체불명 클라이언트로 보이지 않게 하려는 것뿐이다.
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

export interface HiraWebConfig {
  /** 베이스 URL. 바꿀 일이 없지만 테스트에서 갈아끼울 수 있게 열어둔다. */
  baseUrl?: string;

  /**
   * 요청 사이 최소 간격(ms). 기본 1000.
   *
   * **0 으로 낮추지 마라.** 인증도 쿼터도 없는 웹 프런트라 서버가 우리를 막아 주지 않는다 —
   * 속도 조절 책임이 전적으로 이쪽에 있다. 의원만 7만 곳이라 간격을 줄이면 그대로 부하가 된다.
   */
  minIntervalMs?: number;

  readTimeoutMs?: number;
  maxRetry?: number;
  userAgent?: string;
}

interface ResolvedConfig {
  baseUrl: string;
  minIntervalMs: number;
  readTimeoutMs: number;
  maxRetry: number;
  userAgent: string;
}

export function resolveConfig(config: HiraWebConfig = {}): ResolvedConfig {
  return {
    baseUrl: (config.baseUrl ?? HIRA_WEB_BASE_URL).replace(/\/+$/, ''),
    minIntervalMs: config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    readTimeoutMs: config.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS,
    maxRetry: config.maxRetry ?? DEFAULT_MAX_RETRY,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
  };
}

/**
 * 병원 상세 페이지 URL. 이 값이 Referer 로 들어간다.
 *
 * **서버는 Referer 를 검사하지 않는다**(2026-07 실측 — 헤더를 빼도, 다른 기관 ykiho 를 넣어도,
 * 외부 도메인을 넣어도 응답이 같다). 그럼에도 항상 붙인다. 브라우저가 실제로 밟는 경로를 그대로
 * 흉내내려는 것이고, 검사하지 않는다는 이유로 이걸 빼는 '최적화'를 하지 않는다.
 */
export function hospitalPageUrl(baseUrl: string, encryptedYkiho: string): string {
  return `${baseUrl}/ra/hosp/hospInfoAjax.do?ykiho=${encodeURIComponent(encryptedYkiho)}`;
}

/** 요청 간 최소 간격을 강제하는 직렬 게이트. 인스턴스 하나가 한 줄로 흘려보낸다. */
export class RateGate {
  private tail: Promise<void> = Promise.resolve();
  private lastAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  /** 이전 요청과 minIntervalMs 이상 벌어지도록 기다린다. 호출 순서대로 통과한다. */
  async wait(): Promise<void> {
    const mine = this.tail.then(async () => {
      const gap = Date.now() - this.lastAt;
      if (gap < this.minIntervalMs) {
        await sleep(this.minIntervalMs - gap);
      }
      this.lastAt = Date.now();
    });
    // 앞 요청이 실패해도 게이트가 막히면 안 된다.
    this.tail = mine.catch(() => undefined);
    return mine;
  }
}

export interface RawResponse {
  status: number;
  body: string;
}

/**
 * 5xx 와 네트워크 오류만 재시도한다. 4xx 는 즉시 실패시킨다.
 *
 * 429 는 재시도하지 않는다 — 이 사이트가 429 를 쓰는 걸 본 적이 없고, 만약 받는다면 그건
 * 우리가 너무 빠르다는 뜻이라 자동 재시도가 아니라 **사람이 간격을 늘려야** 한다.
 */
export async function sendWithRetry(
  url: string,
  options: RequestInit,
  config: ResolvedConfig,
): Promise<RawResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetry; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'User-Agent': config.userAgent, ...options.headers },
        signal: options.signal ?? AbortSignal.timeout(config.readTimeoutMs),
      });

      const body = await response.text();

      if (response.status < 500) {
        if (!response.ok) {
          throw new HiraWebError(
            `HIRA web returned non-OK response (status=${response.status}) for ${url}`,
            String(response.status),
            { responseBody: body.slice(0, 500) },
          );
        }
        return { status: response.status, body };
      }

      lastError = new HiraWebError(
        `HIRA web server error (status=${response.status})`,
        String(response.status),
        { responseBody: body.slice(0, 500) },
      );
    } catch (error) {
      if (error instanceof HiraWebError) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < config.maxRetry) {
      await sleep(2 ** attempt * 200);
    }
  }

  throw new HiraWebError(
    `HIRA web request failed after ${config.maxRetry} attempts: ${url}`,
    'NETWORK',
    { cause: lastError },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
