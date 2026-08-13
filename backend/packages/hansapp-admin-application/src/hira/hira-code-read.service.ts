import { Injectable } from '@nestjs/common';
import { HiraCodeService, type HiraCodeResponse, type HiraCodeType } from '@hansapp/application';

import { DataSource } from '../common/data-source';
import { HIRA_CODE_FETCHERS } from './hira-code.fetchers';
import { HiraQueryService } from './hira-query.service';

export interface HiraCodeListOptions {
  source: DataSource;

  /** 코드 종류. 원본은 엔드포인트로, 우리는 이 파라미터로 가른다. */
  tp: HiraCodeType;

  pageNo: number;
  numOfRows: number;
}

/**
 * HIRA 코드를 **소스를 골라** 조회한다.
 *
 * db 든 origin 이든 응답 구조는 같다. origin 은 종류별 엔드포인트를 부르고,
 * db 는 hira_code 에서 읽어 원본 필드명으로 되돌린다.
 */
@Injectable()
export class HiraCodeReadService {
  constructor(
    private readonly api: HiraQueryService,
    private readonly db: HiraCodeService,
  ) {}

  async getCodes(options: HiraCodeListOptions): Promise<HiraCodeResponse> {
    if (options.source === 'origin') {
      const response = await HIRA_CODE_FETCHERS[options.tp].fetch(this.api, {
        pageNo: options.pageNo,
        numOfRows: options.numOfRows,
      });
      // 원본 응답을 그대로 넘긴다. 종류별 타입의 합집합이 HiraCodeResponse 다.
      return response as HiraCodeResponse;
    }

    return this.db.listCodes({
      tp: options.tp,
      page: options.pageNo,
      size: options.numOfRows,
    });
  }
}
