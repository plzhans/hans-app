import { createNtsFetch, NtsConfig, NtsFetch } from './http';

/**
 * 생성된 코드는 `ntsMutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(NtsClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 서비스키를 쓸 수 있다. (@krdata/*·@kr-go/* 와 같은 방식)
 */
export interface NtsRequestInit extends RequestInit {
  nts?: NtsConfig;
}

/** 같은 설정으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<NtsConfig, NtsFetch>();

export function withNtsConfig(config: NtsConfig, options?: RequestInit): NtsRequestInit {
  return { ...options, nts: config };
}

export const ntsMutator = async <T>(url: string, options?: NtsRequestInit): Promise<T> => {
  const config = options?.nts;
  if (!config) {
    throw new Error(
      'NTS config is missing. 생성된 함수를 직접 호출하지 말고 NtsClient 를 사용하라.',
    );
  }

  let ntsFetch = fetchCache.get(config);
  if (!ntsFetch) {
    ntsFetch = createNtsFetch(config);
    fetchCache.set(config, ntsFetch);
  }

  const requestInit: NtsRequestInit = { ...options };
  delete requestInit.nts;

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await ntsFetch(url, requestInit);
  return response as T;
};
