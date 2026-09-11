/**
 * 워커와 서버 렌더 진입점이 주고받는 모양.
 *
 * 워커(cloudflare/workers)와 앱(src)은 tsconfig 가 서로 달라서 — 워커 쪽 lib 에는 DOM 이
 * 없다 — 워커가 entry-server.tsx 를 직접 읽지 못한다. 그래서 계약만 여기 떼어 둔다.
 * 이 파일은 JSX 도 브라우저 전역도 쓰지 않아 양쪽 설정에서 모두 읽힌다.
 *
 * entry-server 가 이 타입으로 인자를 받고, 워커의 ssr-bundle.d.ts 가 같은 타입을 참조한다.
 * 한쪽만 바꾸면 컴파일이 깨진다.
 */
import type {
  HealthcareHospitalControllerSearch200,
  HospitalDetailDto,
  HospitalNearbyResponseDto,
} from '@hans-api/sdk';

/** 경로 접두사이자 i18next 언어 코드. shared/i18n 의 SUPPORTED_LANGUAGES 와 같다. */
export type SsrLang = 'ko' | 'en-us' | 'ja' | 'zh-hans';

export type RenderResult = {
  /** <div id="root"> 안에 넣을 마크업. */
  html: string;
  /** 브라우저가 같은 데이터로 다시 부르지 않도록 넘겨주는 react-query 캐시. */
  state: string;
};

export type RenderHospitalInput = {
  url: string;
  lang: SsrLang;
  id: number;
  hospital: HospitalDetailDto;
  /** 못 받았으면 null. 그 섹션만 브라우저가 채우고 나머지는 그대로 그린다. */
  nearby: HospitalNearbyResponseDto | null;
};

export type RenderHomeInput = {
  url: string;
  lang: SsrLang;
  /** HOME_QUERY_PATHS 와 같은 순서. null 인 자리는 브라우저가 채운다. */
  sections: (HealthcareHospitalControllerSearch200 | null)[];
};
