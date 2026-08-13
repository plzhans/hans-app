import { getStandardRegionCodeList } from './generated/stan-regin-cd/stan-regin-cd';
import type {
  GetStandardRegionCodeListParams,
  StandardRegionCodeRow,
} from './generated/stan-regin-cd/model';
import { readRows } from './envelope';
import { MoisConfig, withKrDataConfig } from './mutator';

/** 한 번에 받을 수 있는 최대 건수. 넘기면 ERROR-1 이 온다. */
export const MAX_ROWS_PER_CALL = 1000;

/** 페이지 하나의 결과. */
export interface RegionCodePage {
  /** 전체 결과 수 */
  totalCount: number;
  /** 현재 페이지 번호 */
  pageNo: number;
  /** 이 페이지의 요청 건수 */
  numOfRows: number;
  /** 법정동코드 행. 결과가 없으면 빈 배열이다. */
  rows: StandardRegionCodeRow[];
}

/**
 * 행정안전부 행정표준코드 클라이언트.
 *
 * **응답 봉투만 편다.** 값은 손대지 않는다.
 * 원본은 `{"StanReginCd":[{"head":[…]},{"row":[…]}]}` 처럼 위치로만 구분되는 2칸 배열이라
 * 타입으로 다룰 수가 없다. 호출부가 매번 `[1].row` 를 더듬는 대신 여기서 한 번 편다.
 * 필드명·값은 원본 그대로다 (`region_cd`, `locatadd_nm`, …).
 *
 * 초당 최대 30 TPS 제한이 있다. 병렬 호출은 호출부에서 제어하라.
 */
export class MoisClient {
  constructor(private readonly config: MoisConfig) {}

  /**
   * 법정동코드 조회.
   *
   * `locatadd_nm` 은 부분일치다. 생략하면 전체(20,560건)가 대상이다.
   * 페이지 범위를 넘기면 에러가 아니라 빈 배열이 온다 — 루프의 종료 조건으로 써도 된다.
   */
  async getRegionCodes(params: GetStandardRegionCodeListParams = {}): Promise<RegionCodePage> {
    const { data } = await getStandardRegionCodeList(params, withKrDataConfig(this.config));
    return readRows<StandardRegionCodeRow>(data);
  }

  /**
   * 전량을 페이지 단위로 흘려보낸다.
   *
   * **콜수를 줄이는 게 목적이라 기본이 상한(1,000)이다.** 전체 20,560건이 21콜이면 끝난다.
   * 배열로 모으지 않고 페이지째 넘기므로, 호출부가 받는 대로 적재하고 버릴 수 있다.
   */
  async *streamRegionCodes(
    params: Omit<GetStandardRegionCodeListParams, 'pageNo' | 'numOfRows'> = {},
    numOfRows: number = MAX_ROWS_PER_CALL,
  ): AsyncGenerator<RegionCodePage> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const page = await this.getRegionCodes({ ...params, pageNo, numOfRows });
      if (page.rows.length === 0) {
        return;
      }

      yield page;

      fetched += page.rows.length;
      if (fetched >= page.totalCount) {
        return;
      }
      pageNo += 1;
    }
  }
}
