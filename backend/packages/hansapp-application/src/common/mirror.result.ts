/**
 * 공공데이터 미러 조회 결과.
 *
 * DB 는 API 응답 item 을 JSON 그대로 보관한다. 컬럼으로 펼치지 않으므로
 * 조회 결과도 가공하지 않고 원본을 그대로 넘긴다.
 * 필드 목록은 @krdata/nmc, @krdata/hira 의 openapi 스펙을 참고한다.
 */
export class MirrorHospitalResult {
  /** 기관 식별자. NMC 는 hpid, HIRA 는 ykiho. */
  readonly id: string;

  /** API 응답 item 원본 */
  readonly data: Record<string, unknown>;

  /** 마지막으로 동기화된 시각 */
  readonly syncedAt: Date;

  constructor(params: { id: string; data: Record<string, unknown>; syncedAt: Date }) {
    this.id = params.id;
    this.data = params.data;
    this.syncedAt = params.syncedAt;
  }
}

/**
 * 미러 목록 조회 조건.
 *
 * 검색 조건(이름·주소 등)은 아직 없다. JSON 컬럼에 generated column + 인덱스를 걸기 전까지는
 * 8만 행 전체 스캔이 되기 때문이다. 인덱스를 만든 뒤 조건을 추가한다.
 */
export interface MirrorListCommand {
  page: number;
  size: number;
}
