import { createVworldFetch, VworldConfig, VworldFetch } from './http';

/**
 * 생성된 코드는 `mutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(VworldGeocoderClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 인증키를 쓸 수 있다. (@krdata/* 와 같은 방식)
 *
 * **오퍼레이션도 같이 실어 보낸다.** GetCoord 와 GetAddress 가 경로가 같고 request
 * 파라미터로만 갈리는데, 그 값은 생성된 코드가 만들지 않기 때문이다.
 */
export interface VworldRequestInit extends RequestInit {
  vworld?: VworldConfig;
  operation?: string;
}

/** 같은 (설정, 오퍼레이션) 조합으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<VworldConfig, Map<string, VworldFetch>>();

export function withVworldConfig(
  config: VworldConfig,
  operation: string,
  options?: RequestInit,
): VworldRequestInit {
  return { ...options, vworld: config, operation };
}

export const vworldMutator = async <T>(url: string, options?: VworldRequestInit): Promise<T> => {
  const config = options?.vworld;
  const operation = options?.operation;
  if (!config || !operation) {
    throw new Error(
      'VWORLD config is missing. 생성된 함수를 직접 호출하지 말고 VworldGeocoderClient 를 사용하라.',
    );
  }

  let byOperation = fetchCache.get(config);
  if (!byOperation) {
    byOperation = new Map();
    fetchCache.set(config, byOperation);
  }
  let vworldFetch = byOperation.get(operation);
  if (!vworldFetch) {
    vworldFetch = createVworldFetch(config, operation);
    byOperation.set(operation, vworldFetch);
  }

  const requestInit: VworldRequestInit = { ...options };
  delete requestInit.vworld;
  delete requestInit.operation;

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await vworldFetch(url, requestInit);
  return response as T;
};
