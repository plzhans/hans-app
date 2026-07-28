// **파일명이 'subway-station.json' 이면 안 된다.** 이 파일(subway-station.ts)과 basename 이 겹치는
// 순간, index.ts 의 `from './subway-station'` 을 런타임 CJS 리졸버가 .ts 가 아니라 .json 으로
// 먼저 해석한다. 그러면 모듈 대신 배열이 import 되고 named export 가 전부 undefined 가 된다.
// tsc 는 .ts 를 먼저 보므로 **빌드는 멀쩡히 통과하고 서버만 500 을 뱉는다.** 실제로 그렇게 당했다.
import data from './subway-station.data.json';
import { normalizeStationName } from './subway-station-name';

/**
 * 사전을 구운 원본. **데이터와 같은 파일에 들어 있다.**
 *
 * 따로 관리하면 사전만 갈아끼우고 버전을 안 고치는 날이 반드시 온다 — 그러면 "이게 언제
 * 데이터지?" 를 아무도 답할 수 없게 된다. 생성기가 파일명에서 뽑아 함께 굽는다.
 */
export interface SubwayStationSource {
  /** '국가철도공단' */
  provider: string;

  /** '전국 도시광역철도 역사정보' */
  dataset: string;

  /** 실제로 읽은 엑셀 파일명. '전국 도시광역철도 역사 역사정보_20260701.xlsx' */
  file: string;

  /**
   * 데이터셋 배포일자. 'YYYYMMDD'
   *
   * **엑셀 안의 '데이터 기준일자' 컬럼이 아니다.** 그건 행마다 다르고 형식도 제각각이라
   * 데이터셋 전체의 버전이 못 된다. 이 값은 파일명 끝의 날짜다.
   *
   * 이 값이 그대로면 사전도 그대로다 — 클라이언트가 캐시 키로 쓸 수 있다.
   */
  version: string;
}

/**
 * 지하철역 한 건.
 *
 * **키는 역명(ko)이다. 역코드가 아니다.** 원본의 역코드는 노선마다 달라서(환승역은 같은 역에
 * 코드가 여러 개다) 역을 식별하지 못한다. 병원 교통정보도 코드가 아니라 이름으로만 역을 가리킨다.
 */
export interface SubwayStation {
  /** 정규화된 한국어 역명. 사전의 키다. '강남', '총신대입구' ('역' 접미사·부역명 없음) */
  ko: string;

  /** 영문 역명. 원본(국가철도공단) 결측 0 건이라 사실상 항상 있다. */
  en: string | null;

  /**
   * 일문 역명. **108역이 비어 있다** — 대구 94역(원본이 '없음' 이라 적어 보낸다)과
   * 대전 22역·인천공항 6역이 빈칸이다(중복 제거 후 108).
   *
   * 비면 호출부가 ko 로 폴백한다. 한국어라도 보이는 게 빈칸보다 낫다.
   * 표기 체계가 노선마다 다르다(가타카나 음차 / 한자)는 걸 알고 있지만 **손대지 않는다** —
   * 정부 표기를 우리가 판정해 고칠 근거가 없다.
   */
  ja: string | null;

  /** 이 역을 지나는 노선. '1호선', '신분당선', '부산김해선' */
  lines: string[];
}

/**
 * 전국 도시·광역철도 916역. 국가철도공단 표준데이터에서 구웠다.
 *
 * **손으로 고치지 마라.** subway-station.data.json 은 생성물이다.
 *   pnpm --filter @hansapp/data codegen:subway
 *
 * 부팅 비용은 약 3ms / 힙 826KB 다(실측). 이미 올라가 있는 seed 보다 싸다.
 */
export const SUBWAY_STATIONS: readonly SubwayStation[] = data.stations;

/** 이 사전이 어느 원본의 몇 년 몇 월 자료인지. 대외 응답에 그대로 실어 보낸다. */
export const SUBWAY_STATION_SOURCE: SubwayStationSource = data.source;

const BY_NAME = new Map(SUBWAY_STATIONS.map((s) => [s.ko, s]));

/**
 * 역명으로 찾는다. 넘긴 이름은 정규화해서 맞춘다 — '강남역', '강남', '강남 ' 이 모두 붙는다.
 *
 * **못 찾으면 undefined 다. 이건 정상이다.** 병원 교통정보의 하차역명에는 오타('선능역')와
 * 구 역명('신남역' → 청라언덕)이 섞여 있어서 사전과 곧바로 안 붙는 것이 54건 있다.
 * 그건 사전의 구멍이 아니라 원문의 문제이고, 별칭 사전으로 따로 덮는다.
 */
export function findSubwayStation(name: string): SubwayStation | undefined {
  return BY_NAME.get(normalizeStationName(name));
}

export { normalizeStationName };
