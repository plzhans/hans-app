import { Inject, Injectable } from '@nestjs/common';
import { MoisClient } from '@krdata/mois';
import type {
  GetStandardRegionCodeListParams,
  RegionCodePage,
} from '@krdata/mois';

import { MOIS_CLIENT } from '../krdata.providers';

/**
 * 행정안전부 원본 API 조회. **SDK 를 잡는 유일한 자리다.**
 *
 * CLI 는 이 서비스를 통해서만 원본을 부른다. 적재(sync)도 마찬가지다 —
 * SDK 를 직접 들고 있는 곳이 늘면 서비스키·재시도 정책이 갈라진다.
 */
@Injectable()
export class MoisQueryService {
  constructor(@Inject(MOIS_CLIENT) private readonly client: MoisClient) {}

  /** 법정동코드 한 페이지. */
  getRegionCodes(
    params: GetStandardRegionCodeListParams = {},
  ): Promise<RegionCodePage> {
    return this.client.getRegionCodes(params);
  }

  /**
   * 법정동코드 전량을 페이지 단위로 흘려보낸다.
   *
   * 기본 건수가 상한(1,000)이라 전량이 21콜이다. 배열로 모으지 않고 페이지째 넘기므로
   * 호출부가 받는 대로 적재하고 버릴 수 있다 — 2MB 를 통째로 메모리에 들고 있지 않는다.
   */
  streamRegionCodes(
    params: Omit<GetStandardRegionCodeListParams, 'pageNo' | 'numOfRows'> = {},
    numOfRows?: number,
  ): AsyncGenerator<RegionCodePage> {
    return this.client.streamRegionCodes(params, numOfRows);
  }
}
