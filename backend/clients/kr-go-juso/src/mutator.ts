import { createJusoFetch, JusoConfig, JusoFetch } from './http';

/**
 * 생성된 코드는 `jusoMutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(JusoClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 승인키를 쓸 수 있다. (@krdata/*·@seouldata/* 와 같은 방식)
 */
export interface JusoRequestInit extends RequestInit {
  juso?: JusoConfig;
}

/** 같은 설정으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<JusoConfig, JusoFetch>();

export function withJusoConfig(
  config: JusoConfig,
  options?: RequestInit,
): JusoRequestInit {
  return { ...options, juso: config };
}

export const jusoMutator = async <T>(
  url: string,
  options?: JusoRequestInit,
): Promise<T> => {
  const config = options?.juso;
  if (!config) {
    throw new Error(
      'JUSO config is missing. 생성된 함수를 직접 호출하지 말고 JusoClient 를 사용하라.',
    );
  }

  let jusoFetch = fetchCache.get(config);
  if (!jusoFetch) {
    jusoFetch = createJusoFetch(config);
    fetchCache.set(config, jusoFetch);
  }

  const requestInit: JusoRequestInit = { ...options };
  delete requestInit.juso;

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await jusoFetch(url, requestInit);
  return response as T;
};
