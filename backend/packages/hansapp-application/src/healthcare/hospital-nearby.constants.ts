/**
 * 근처 유사 병원 조회의 기본 정책. 응용(command) 계층이 소유하며,
 * 전송 계층 DTO 의 검증/문서값이 이 상수를 공유한다(페이지네이션 상수와 같은 태도).
 */

/**
 * 등급별 탐색 정책.
 *
 * **"근처" 의 크기는 등급마다 다르다.** 의원은 걸어갈 곳을 찾는 자리고 상급종합은 이 권역에서
 * 갈 만한 곳을 찾는 자리다. 색인 전수를 재어 보면 같은 등급 다섯 곳이 잡히는 거리가 이렇다
 * (2026-08, 활성 병원 81,646곳 기준. 중앙값 / 80% 지점):
 *
 *   TIER1  의원급    77,422곳     75m / 178m
 *   TIER2  병원급     2,718곳    1.4km / 3.3km
 *   TIER3  상급종합      47곳   38.7km / 79.7km
 *   NURSING 요양       1,323곳    5.5km / 13.8km
 *   MENTAL  정신         262곳   13.3km / 27.3km
 *
 * radius 는 대략 80% 지점을 덮도록 잡았다. 전부를 덮으려 들면 도심에서 후보가 수천 건이 된다.
 */
export interface NearbyTierPolicy {
  /** 탐색 반경(m) */
  radius: number;

  /**
   * **거리를 따지지 않는 구간(m).**
   *
   * 감쇠 곡선의 offset 이자 동점 정렬의 버킷이다 — 개념이 하나라 값도 하나로 둔다.
   * 이 안에서는 점수도 같고 순위도 거리로 안 가른다. 의원급 100m 는 걸어서 1분 거리라
   * 사용자에게 같은 거리이고, 상급종합 5km 를 100m 단위로 줄 세우는 건 의미가 없다.
   */
  offset: number;

  /**
   * 감쇠 폭(m). 이 거리만큼 멀어질 때마다 점수가 절반이 된다.
   *
   * **반경만 늘리고 이걸 안 늘리면 소용이 없다** — scale 이 1km 인 채로 80km 를 훑으면
   * 먼 후보의 가중치가 0으로 언더플로우돼 유사도 신호가 통째로 사라진다.
   */
  scale: number;
}

/** 등급을 모르는 병원(기타)의 정책. 예전 고정값을 그대로 쓴다. */
export const DEFAULT_NEARBY_POLICY: NearbyTierPolicy = {
  radius: 3000,
  offset: 300,
  scale: 1000,
};

export const NEARBY_TIER_POLICY: Readonly<Record<string, NearbyTierPolicy>> = {
  TIER1: { radius: 1000, offset: 100, scale: 300 },
  TIER2: { radius: 5000, offset: 300, scale: 1500 },
  TIER3: { radius: 80000, offset: 5000, scale: 25000 },
  NURSING: { radius: 15000, offset: 1000, scale: 5000 },
  MENTAL: { radius: 30000, offset: 2000, scale: 10000 },
};

/**
 * 같은 등급이 모자랄 때 **보충할 등급**.
 *
 * 상급종합은 전국에 47곳뿐이라 80km 를 훑어도 다섯이 안 차는 곳이 있다. 그때 섹션을 비우는
 * 대신 한 단계 내려가 채운다 — 같은 등급이 **먼저** 오고 보충분이 뒤에 붙으므로, 화면은
 * 각 항목의 tier 를 보고 구분할 수 있다.
 *
 * 의원급만 위로 올라간다(아래가 없다). 읍면에서 의원이 다섯 곳도 없으면 병원급이 실제 대안이다.
 *
 * **요양·정신은 보충하지 않는다.** 장기 입원 시설을 찾는 사람에게 외래 의원은 대안이 아니다 —
 * 모자라면 모자란 대로 낸다.
 */
export const NEARBY_TIER_FALLBACK: Readonly<Record<string, string>> = {
  TIER3: 'TIER2',
  TIER2: 'TIER1',
  TIER1: 'TIER2',
};

/** 최소 반경(m). 이보다 좁으면 도심에서도 후보가 한두 곳뿐이라 섹션이 의미를 잃는다. */
export const MIN_NEARBY_RADIUS = 500;

/**
 * 최대 반경(m).
 *
 * 상급종합 때문에 크다. 전국 47곳이라 같은 등급끼리는 중앙값 38.7km 떨어져 있어서,
 * 예전 상한(5km)으로는 **서로를 아예 못 찾았다.** 의원급에 100km 를 주면 후보가 수만 건이
 * 되지만, 그건 기본값(등급별 정책)이 막는다 — 이 상한은 클라이언트가 직접 지정할 때의 안전선이다.
 */
export const MAX_NEARBY_RADIUS = 100000;

/** 기본 개수. 상세 하단 섹션은 다섯 곳이면 충분하다. */
export const DEFAULT_NEARBY_SIZE = 5;

export const MIN_NEARBY_SIZE = 1;

/**
 * 최대 개수. "더 보기" 를 붙이는 화면이 한 번 더 부를 여지다.
 *
 * 커서(이어받기)를 두지 않은 이유는 **뒷페이지가 앞페이지보다 싸지 않아서다** — 채점 비용은
 * 반경이 정하지 size 가 정하지 않으므로, 이어받기를 만들어도 같은 채점을 처음부터 다시 한다.
 * 그럴 바엔 size 를 키워 다시 부르는 편이 계약이 단순하다.
 */
export const MAX_NEARBY_SIZE = 20;
