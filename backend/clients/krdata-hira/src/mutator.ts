import { createKrDataFetch, KrDataConfig, KrDataFetch } from '@krdata/core';

export const HIRA_BASE_URL = 'https://apis.data.go.kr/B551182';

/** openapi 스펙에 박혀 있는 상세 서비스 버전. 경로를 바꿀 때 기준이 된다. */
export const SPEC_DETAIL_VERSION = '2.8';

export type HiraConfig = Omit<KrDataConfig, 'baseUrl'> &
  Partial<Pick<KrDataConfig, 'baseUrl'>> & {
    /**
     * 의료기관별상세정보서비스(MadmDtlInfoService)의 버전. 기본 2.8.
     *
     * **키마다 승인된 버전이 다르다.** 포털은 서비스 버전이 오르면 기존 신청자에겐 옛 버전을
     * 유지시키고 새 활용신청은 새 버전으로만 승인한다. 그래서 2.7 만 승인된 키로 2.8 을
     * 부르면 403 Forbidden 이다 — 키가 아니라 경로가 틀린 것이다. (2026-07 실측)
     *
     * 스펙을 다시 생성하지 않고 이 값만 바꿔서 키에 맞춘다.
     */
    detailVersion?: string;
  };

/**
 * 상세 서비스 경로의 버전을 설정값으로 갈아끼운다.
 *
 *   /MadmDtlInfoService2.8/getTrnsprtInfo2.8  →  /MadmDtlInfoService2.7/getTrnsprtInfo2.7
 *
 * 서비스명과 오퍼레이션 접미사 **둘 다** 바꿔야 한다. 하나만 바꾸면 404 다.
 * 상세 서비스가 아닌 경로(hospInfoServicev2, codeInfoService)는 건드리지 않는다.
 */
function applyDetailVersion(url: string, version: string): string {
  if (version === SPEC_DETAIL_VERSION) {
    return url;
  }
  const escaped = SPEC_DETAIL_VERSION.replace('.', '\\.');
  return url.replace(
    new RegExp(`/MadmDtlInfoService${escaped}/([A-Za-z]+)${escaped}`),
    `/MadmDtlInfoService${version}/$1${version}`,
  );
}

/**
 * 생성된 코드는 `krDataMutator(url, options)` 형태로만 호출하므로 설정을 넘길 자리가 없다.
 * 그래서 호출부(HiraClient)가 RequestInit 에 설정을 실어 보내고 여기서 꺼내 쓴다.
 * 이렇게 하면 모듈 전역 상태 없이 클라이언트 인스턴스마다 다른 서비스키를 쓸 수 있다.
 */
export interface KrDataRequestInit extends RequestInit {
  krdata?: HiraConfig;
}

/** 같은 설정으로 fetch 를 매번 새로 만들지 않도록 캐시한다. */
const fetchCache = new WeakMap<HiraConfig, KrDataFetch>();

export function withKrDataConfig(config: HiraConfig, options?: RequestInit): KrDataRequestInit {
  return { ...options, krdata: config };
}

export const krDataMutator = async <T>(url: string, options?: KrDataRequestInit): Promise<T> => {
  const config = options?.krdata;
  if (!config) {
    throw new Error(
      'KR-DATA config is missing. 생성된 함수를 직접 호출하지 말고 HiraClient 를 사용하라.',
    );
  }

  let krDataFetch = fetchCache.get(config);
  if (!krDataFetch) {
    krDataFetch = createKrDataFetch({ baseUrl: HIRA_BASE_URL, ...config });
    fetchCache.set(config, krDataFetch);
  }

  const requestInit: KrDataRequestInit = { ...options };
  delete requestInit.krdata;

  const target = applyDetailVersion(url, config.detailVersion ?? SPEC_DETAIL_VERSION);

  // orval 의 fetch 클라이언트는 { data, status, headers } 봉투를 기대한다.
  const response = await krDataFetch(target, requestInit);
  return response as T;
};
