/**
 * 참조 데이터 (reference).
 *
 * **seed 와 다르다.** seed 는 DB 에 적재되는 데이터이고(healthcare_code·region_code),
 * reference 는 **DB 를 거치지 않고 코드가 직접 들고 있는** 사전이다.
 *
 * 지하철역 사전을 DB 에 넣지 않은 이유:
 *   - 원본 코드와의 매핑이 없다. 병원 테이블이 FK 로 참조하지도 않는다.
 *   - 916행이라 전부 메모리에 올려도 826KB 다. DB 왕복(수 ms)보다 조회가 빠르다(17ns).
 *   - 관리자가 값을 고칠 일이 없다 — 원본이 갱신되면 사전을 다시 굽고 배포한다.
 * "강남역 근처 병원 검색" 같은 조인 축이 필요해지면 그건 사전을 DB 로 옮길 게 아니라
 * healthcare_hospital.transport 에 multi-valued index 를 거는 문제다. (schema.prisma 주석 참고)
 */
export {
  SUBWAY_STATIONS,
  SUBWAY_STATION_SOURCE,
  findSubwayStation,
  normalizeStationName,
} from './subway-station';
export type { SubwayStation, SubwayStationSource } from './subway-station';
