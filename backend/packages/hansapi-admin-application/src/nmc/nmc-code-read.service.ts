import { Injectable } from '@nestjs/common';
import { NmcCodeService } from '@hansapi/application';
import type { CodeInfoResponse } from '@krdata/nmc';

import { DataSource } from '../common/data-source';
import { NmcQueryService } from './nmc-query.service';

export interface NmcCodeListOptions {
  source: DataSource;

  /** 대분류코드로 좁힌다. 원본 API 의 CM_MID 파라미터. */
  cmMid?: string;

  pageNo: number;
  numOfRows: number;
}

/**
 * NMC 코드마스터를 **소스를 골라** 조회한다. 양쪽이 같은 타입(CodeInfoResponse)이라
 * 호출부는 소스를 몰라도 결과를 똑같이 다룬다.
 */
@Injectable()
export class NmcCodeReadService {
  constructor(
    private readonly api: NmcQueryService,
    private readonly db: NmcCodeService,
  ) {}

  async getCodes(options: NmcCodeListOptions): Promise<CodeInfoResponse> {
    if (options.source === 'origin') {
      // 요청 파라미터명은 대문자 CM_MID 다. 소문자로 보내면 서버가 조용히 무시한다.
      return this.api.getCodeList({
        CM_MID: options.cmMid,
        pageNo: options.pageNo,
        numOfRows: options.numOfRows,
      });
    }

    return this.db.listCodes({
      cmMid: options.cmMid,
      page: options.pageNo,
      size: options.numOfRows,
    });
  }
}
