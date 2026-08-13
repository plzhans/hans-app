import { Injectable } from '@nestjs/common';
import { NmcHospitalService } from '@hansapp/application';
import type { HospitalFullDownResponse } from '@krdata/nmc';

import { DataSource } from '../common/data-source';
import { NmcQueryService } from './nmc-query.service';

export interface NmcHospitalListOptions {
  source: DataSource;
  pageNo: number;
  numOfRows: number;
}

/**
 * NMC 병원 목록을 **소스를 골라** 조회한다.
 *
 * DB 미러(nmc_hospital)는 FullData 내려받기(getHsptlMdcncFullDown)로 적재했다.
 * 그래서 origin 도 같은 오퍼레이션을 부른다. 양쪽이 **같은 타입**(HospitalFullDownResponse)이라
 * 호출부는 소스를 몰라도 결과를 똑같이 다룬다. 응답 타입은 openapi 에서 생성된 것을 그대로 쓴다.
 */
@Injectable()
export class NmcHospitalReadService {
  constructor(
    private readonly api: NmcQueryService,
    private readonly db: NmcHospitalService,
  ) {}

  async getHospitalList(options: NmcHospitalListOptions): Promise<HospitalFullDownResponse> {
    if (options.source === 'origin') {
      return this.api.getHospitalFullDown({
        pageNo: options.pageNo,
        numOfRows: options.numOfRows,
      });
    }

    // DB 조회도 원본 API 와 같은 타입으로 돌아온다. 봉투를 만드는 것은 application 계층의 몫이다.
    return this.db.listHospitals({
      page: options.pageNo,
      size: options.numOfRows,
    });
  }
}
