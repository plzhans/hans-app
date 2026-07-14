const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_READ_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRY = 3;

/** 공공데이터포털 설정 */
export interface KrDataConfig {
  /**
   * 공공데이터포털에서 발급받은 서비스키.
   *
   * 포털이 제공하는 "Encoding" 키(`%2B`, `%3D` 등이 포함된 형태)를 그대로 넣는다.
   * 이 값은 쿼리스트링에 재인코딩 없이 붙는다. 자세한 이유는 buildUrl 주석 참고.
   */
  serviceKey: string;

  /** API 베이스 URL (기관별 클라이언트가 주입) */
  baseUrl: string;

  /** 응답을 기다리는 최대 시간 (ms) */
  readTimeoutMs?: number;

  /** 요청 실패 시 최대 시도 횟수 */
  maxRetry?: number;
}

export type ResolvedKrDataConfig = Required<KrDataConfig>;

export function resolveConfig(config: KrDataConfig): ResolvedKrDataConfig {
  if (!config.serviceKey || config.serviceKey.trim() === '') {
    throw new Error('KR-DATA service key is not set');
  }
  return {
    serviceKey: config.serviceKey,
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    readTimeoutMs: positiveOr(config.readTimeoutMs, DEFAULT_READ_TIMEOUT_MS),
    maxRetry: positiveOr(config.maxRetry, DEFAULT_MAX_RETRY),
  };
}

/**
 * 서비스키를 마스킹한다. **앞 5글자만** 남긴다. (로그 출력용)
 *
 * 키를 여러 개 돌려 쓰면 "어느 키가 거부됐나"를 알아야 손을 쓸 수 있다. 앞 5글자면
 * 사람이 env 파일과 대조하기에 충분하고, 이 문구는 로그·DB(sync_state.error)에 남으므로
 * 그 이상은 남기지 않는다.
 */
export function maskServiceKey(serviceKey: string): string {
  if (serviceKey.length <= 5) {
    return '****';
  }
  return `${serviceKey.slice(0, 5)}****`;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && value > 0 ? value : fallback;
}

export {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_MAX_RETRY,
};
