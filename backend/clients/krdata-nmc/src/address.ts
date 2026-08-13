/**
 * NMC 주소(dutyAddr)에서 시도·시군구를 뽑는다.
 *
 * NMC 는 지역을 코드로 주지 않는다. 병원 item 에 있는 주소 관련 값은 dutyAddr(전체 주소 문자열)과
 * 우편번호뿐이고, 검색 파라미터(Q0/Q1)도 코드가 아니라 주소 문자열의 부분 일치다.
 * 그래서 지역으로 검색·집계하려면 주소에서 뽑아내는 수밖에 없다.
 *
 * HIRA 는 sidoCd/sgguCd 를 직접 주므로 이 파서가 필요 없다. 주소 규칙은 기관마다 다르므로
 * 공용(@krdata/core)으로 올리지 않고 NMC 안에 둔다.
 *
 * 실측(2026-07, 78,631건):
 *   시도   24종 → 정규화 후 17종. 미추출 0건
 *   시군구 237종. 미추출 468건 (세종 461건은 시군구가 없는 게 정상, 나머지 7건은 원본 결손)
 */

/**
 * 시도 축약 표기.
 *
 * 대부분은 정식 명칭(`서울특별시`)으로 오지만 일부 행이 축약형(`서울`)으로 온다. 실측 133건.
 * 같은 지역이 두 값으로 갈리면 검색에서 누락되므로 정식 명칭으로 맞춘다.
 */
const SIDO_ALIASES: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전남광주통합특별시',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

/** 주소에서 뽑아낸 지역. 못 뽑으면 undefined. */
export interface NmcRegion {
  /** 시도명. 축약 표기는 정식 명칭으로 정규화한다. */
  sidoNm?: string;

  /**
   * 시군구명. 세종특별자치시처럼 시군구가 없는 지역은 undefined 다.
   * 시 아래 구가 있으면 `수원시 팔달구` 처럼 두 토큰을 합친다.
   */
  sgguNm?: string;
}

/**
 * `dutyAddr` 를 시도·시군구로 가른다.
 *
 * 규칙은 두 개뿐이다.
 *   1. 첫 토큰이 시도. 축약형이면 정식 명칭으로 바꾼다.
 *   2. 둘째 토큰이 시/군/구로 끝나면 시군구. 단 `~시` 뒤에 `~구` 가 오면 둘을 합친다.
 *
 * 시군구가 될 수 없는 토큰(도로명·읍면동 등)은 버린다. 예를 들어 세종특별자치시는
 * 시군구 없이 바로 읍면동(`조치원읍`)이 오는데, 이때 sgguNm 은 undefined 가 맞다.
 */
export function parseNmcRegion(dutyAddr: unknown): NmcRegion {
  if (typeof dutyAddr !== 'string') {
    return {};
  }

  const tokens = dutyAddr.trim().split(/\s+/);
  const first = tokens[0];
  if (!first) {
    return {};
  }

  const sidoNm = SIDO_ALIASES[first] ?? first;

  const second = tokens[1];
  if (!second || !/[시군구]$/.test(second)) {
    return { sidoNm };
  }

  const third = tokens[2];
  const sgguNm = /시$/.test(second) && third && /구$/.test(third) ? `${second} ${third}` : second;

  return { sidoNm, sgguNm };
}
