import { createSeoulDataFetch, SeoulDataConfig, SeoulDataFetch } from './http';

/**
 * 생성된 코드는 `seoulDataMutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(SubwayClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 인증키를 쓸 수 있다. (@krdata/* 와 같은 방식)
 */
export interface SeoulDataRequestInit extends RequestInit {
  seouldata?: SeoulDataConfig;
}

/** 같은 설정으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<SeoulDataConfig, SeoulDataFetch>();

export function withSeoulDataConfig(
  config: SeoulDataConfig,
  options?: RequestInit,
): SeoulDataRequestInit {
  return { ...options, seouldata: config };
}

export const seoulDataMutator = async <T>(
  url: string,
  options?: SeoulDataRequestInit,
): Promise<T> => {
  const config = options?.seouldata;
  if (!config) {
    throw new Error(
      'SEOUL-DATA config is missing. 생성된 함수를 직접 호출하지 말고 SubwayClient 를 사용하라.',
    );
  }

  let seoulDataFetch = fetchCache.get(config);
  if (!seoulDataFetch) {
    seoulDataFetch = createSeoulDataFetch(config);
    fetchCache.set(config, seoulDataFetch);
  }

  const requestInit: SeoulDataRequestInit = { ...options };
  delete requestInit.seouldata;

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await seoulDataFetch(url, requestInit);
  return response as T;
};
