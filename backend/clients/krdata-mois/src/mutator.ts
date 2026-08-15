import { createKrDataFetch, KrDataConfig, KrDataFetch } from '@krdata/core';

import { MOIS_ENVELOPE } from './envelope';

export const MOIS_BASE_URL = 'https://apis.data.go.kr/1741000';

export type MoisConfig = Omit<KrDataConfig, 'baseUrl' | 'envelope'> &
  Partial<Pick<KrDataConfig, 'baseUrl'>>;

/**
 * 생성된 코드는 `krDataMutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(MoisClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 이렇게 하면 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 서비스키를 쓸 수 있다.
 */
export interface KrDataRequestInit extends RequestInit {
  krdata?: MoisConfig;
}

/** 같은 설정으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<MoisConfig, KrDataFetch>();

export function withKrDataConfig(config: MoisConfig, options?: RequestInit): KrDataRequestInit {
  return { ...options, krdata: config };
}

export const krDataMutator = async <T>(url: string, options?: KrDataRequestInit): Promise<T> => {
  const config = options?.krdata;
  if (!config) {
    throw new Error(
      'KR-DATA config is missing. Use MoisClient instead of calling the generated function directly.',
    );
  }

  let krDataFetch = fetchCache.get(config);
  if (!krDataFetch) {
    // 봉투는 고정이다. 호출부가 갈아끼울 이유가 없어 설정에서 받지 않는다.
    krDataFetch = createKrDataFetch({
      baseUrl: MOIS_BASE_URL,
      ...config,
      envelope: MOIS_ENVELOPE,
    });
    fetchCache.set(config, krDataFetch);
  }

  const requestInit: KrDataRequestInit = { ...options };
  delete requestInit.krdata;

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await krDataFetch(url, requestInit);
  return response as T;
};
