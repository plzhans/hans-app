import { createKrDataFetch, KrDataConfig, KrDataFetch } from '@krdata/core';

export const NMC_BASE_URL = 'https://apis.data.go.kr/B552657';

export type NmcConfig = Omit<KrDataConfig, 'baseUrl'> & Partial<Pick<KrDataConfig, 'baseUrl'>>;

/**
 * 생성된 코드는 `krDataMutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(NmcClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 이렇게 하면 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 서비스키를 쓸 수 있다.
 */
export interface KrDataRequestInit extends RequestInit {
  krdata?: NmcConfig;
}

/** 같은 설정으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<NmcConfig, KrDataFetch>();

export function withKrDataConfig(config: NmcConfig, options?: RequestInit): KrDataRequestInit {
  return { ...options, krdata: config };
}

export const krDataMutator = async <T>(url: string, options?: KrDataRequestInit): Promise<T> => {
  const config = options?.krdata;
  if (!config) {
    throw new Error(
      'KR-DATA config is missing. 생성된 함수를 직접 호출하지 말고 NmcClient 를 사용하라.',
    );
  }

  let krDataFetch = fetchCache.get(config);
  if (!krDataFetch) {
    krDataFetch = createKrDataFetch({ baseUrl: NMC_BASE_URL, ...config });
    fetchCache.set(config, krDataFetch);
  }

  const requestInit: KrDataRequestInit = { ...options };
  delete requestInit.krdata;

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await krDataFetch(url, requestInit);
  return response as T;
};
