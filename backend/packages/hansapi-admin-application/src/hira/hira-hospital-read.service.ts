import { Injectable } from '@nestjs/common';
import { HiraHospitalService } from '@hansapi/application';
import type { HospitalListResponse } from '@krdata/hira';

import { DataSource } from '../common/data-source';
import { HiraQueryService } from './hira-query.service';

export interface HiraHospitalListOptions {
  source: DataSource;
  pageNo: number;
  numOfRows: number;

  /** 아래는 공공데이터 API 필터. DB 모드에서는 아직 쓸 수 없다. */
  sido?: string;
  sggu?: string;
  emdong?: string;
  name?: string;
  cl?: string;
  subject?: string;
  lon?: string;
  lat?: string;
  radius?: number;
}

/** DB 모드에서 아직 지원하지 않는 필터 */
const API_ONLY_FILTERS = [
  'sido',
  'sggu',
  'emdong',
  'name',
  'cl',
  'subject',
  'lon',
  'lat',
  'radius',
] as const;

/**
 * HIRA 병원 목록을 **소스를 골라** 조회한다.
 *
 * DB 미러(hira_hospital)는 병원 기본목록(hospInfoServicev2/getHospBasisList)으로 적재했고
 * origin 도 같은 오퍼레이션을 부른다. 양쪽이 같은 타입(HospitalListResponse)이라
 * 호출부는 소스를 몰라도 결과를 똑같이 다룬다.
 */
@Injectable()
export class HiraHospitalReadService {
  constructor(
    private readonly api: HiraQueryService,
    private readonly db: HiraHospitalService,
  ) {}

  async getHospitalList(
    options: HiraHospitalListOptions,
  ): Promise<HospitalListResponse> {
    if (options.source === 'origin') {
      return this.api.getHospitalList({
        sidoCd: options.sido,
        sgguCd: options.sggu,
        emdongNm: options.emdong,
        yadmNm: options.name,
        clCd: options.cl,
        dgsbjtCd: options.subject,
        xPos: options.lon,
        yPos: options.lat,
        radius: options.radius,
        pageNo: options.pageNo,
        numOfRows: options.numOfRows,
      });
    }

    this.assertNoApiOnlyFilters(options);

    // DB 조회도 원본 API 와 같은 타입으로 돌아온다. 봉투를 만드는 것은 application 계층의 몫이다.
    return this.db.listHospitals({
      page: options.pageNo,
      size: options.numOfRows,
    });
  }

  /**
   * DB 미러는 JSON 컬럼이라 아직 검색 인덱스가 없다. 필터를 조용히 무시하면
   * 결과가 틀렸는데도 맞는 줄 알게 되므로 명시적으로 실패시킨다.
   * generated column + 인덱스를 붙이면 이 제한을 푼다.
   */
  private assertNoApiOnlyFilters(options: HiraHospitalListOptions): void {
    const used = API_ONLY_FILTERS.filter(
      (key) => options[key] !== undefined && options[key] !== '',
    );
    if (used.length > 0) {
      throw new Error(
        `필터(${used.join(', ')})는 DB 모드에서 아직 지원하지 않는다. --origin 을 쓰거나 필터를 빼라.\n` +
          'DB 미러는 JSON 컬럼이라 검색 인덱스(generated column)가 붙기 전까지 페이징만 가능하다.',
      );
    }
  }
}
