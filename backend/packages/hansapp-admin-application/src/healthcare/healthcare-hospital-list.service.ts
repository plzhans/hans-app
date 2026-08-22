import { Injectable } from '@nestjs/common';
import { BadRequestError, Page } from '@hansapp/common';
import type { HealthcareHospital } from '@hansapp/data';

import { AdminErrorCode } from '../error';
import {
  HealthcareHospitalListRepository,
  type HospitalAdminListFilter,
} from './healthcare-hospital-list.repository';
import {
  HealthcareHospitalListSearchRepository,
  type HospitalAdminRow,
  type HospitalAdminSearchFilter,
} from './healthcare-hospital-list-search.repository';

export type HospitalAdminEngine = 'db' | 'es';

/**
 * 관리자 병원 목록 조회 조건. **engine 이 필터 가능 범위를 가른다.**
 *
 *  - db : keyword·status·classCd·regionCd 만. 전체 상태(비활성 포함)를 본다.
 *  - es : 위에 더해 진료과목·장비·전문분야 등 상세 코드 필터. **색인엔 활성 병원만
 *         있어** status 는 'active' 로만 쓸 수 있다(비우면 자동으로 활성만 본다는 뜻은
 *         아니다 — 색인 자체가 그것만 담고 있다).
 */
export interface HospitalAdminListQuery {
  engine: HospitalAdminEngine;
  page: number;
  size: number;
  keyword?: string;
  status?: string;
  classCd?: string;
  regionCd?: string;
  tier?: string[];
  emergency?: boolean;
  baby?: boolean;
  subjectCds?: string[];
  specialistCds?: string[];
  equipmentCds?: string[];
  specialtyCds?: string[];
  specialCds?: string[];
  asmExcellentCds?: string[];
}

/** engine=db 에서 못 쓰는 상세필터 키. ES 색인에만 있는 코드 조건들이다. */
const ES_ONLY_FILTER_KEYS: (keyof HospitalAdminListQuery)[] = [
  'tier',
  'emergency',
  'baby',
  'subjectCds',
  'specialistCds',
  'equipmentCds',
  'specialtyCds',
  'specialCds',
  'asmExcellentCds',
];

/**
 * healthcare_hospital 관리자 목록. **DB(최소조건)·ES(상세조건) 두 저장소를 engine 플래그로
 * 대행시킨다** — 공개 API 의 db/es 대행 구조(HospitalSearchSource)와 같은 결이지만, 이
 * 계층은 그 패키지를 의존하지 않는다(admin-application 은 도메인 코드를 자체로 갖는다).
 *
 * **기본은 DB 다.** 관리자가 흔히 찾는 것은 비활성·중복병합된 병원처럼 ES 색인에 아예
 * 없는 행이라, 상세검색이 필요할 때만 engine=es 로 넘어가는 편이 자연스럽다.
 */
@Injectable()
export class HealthcareHospitalListService {
  constructor(
    private readonly dbRepo: HealthcareHospitalListRepository,
    private readonly esRepo: HealthcareHospitalListSearchRepository,
  ) {}

  async list(query: HospitalAdminListQuery): Promise<Page<HospitalAdminRow>> {
    if (query.engine === 'es') {
      this.assertActiveStatusOnly(query);
      const { rows, total } = await this.esRepo.search(
        toSearchFilter(query),
        query.page,
        query.size,
      );
      return new Page(rows, query.page, query.size, total);
    }

    this.assertNoEsOnlyFilters(query);
    const { rows, total } = await this.dbRepo.list(toListFilter(query), query.page, query.size);
    return new Page(rows.map(toAdminRow), query.page, query.size, total);
  }

  /** ES 색인은 status='active' 인 병원만 담는다(색인기 정책). 다른 값은 답이 항상 빈다. */
  private assertActiveStatusOnly(query: HospitalAdminListQuery): void {
    if (query.status && query.status !== 'active') {
      throw new BadRequestError(AdminErrorCode.ADMIN_QUERY_UNSUPPORTED, {
        message:
          `The search index only holds active hospitals (status=${query.status} requested). ` +
          'Use engine=db to see other statuses.',
      });
    }
  }

  /** 조용히 무시하지 않는다 — 걸린 줄 알았던 필터가 빠지면 결과가 틀렸는데도 맞는 줄 안다. */
  private assertNoEsOnlyFilters(query: HospitalAdminListQuery): void {
    const used = ES_ONLY_FILTER_KEYS.filter((key) => {
      const value = query[key];
      return Array.isArray(value) ? value.length > 0 : value !== undefined;
    });
    if (used.length > 0) {
      throw new BadRequestError(AdminErrorCode.ADMIN_QUERY_UNSUPPORTED, {
        message:
          `Filters (${used.join(', ')}) require engine=es — the database path only supports ` +
          'keyword/status/classCd/regionCd.',
      });
    }
  }
}

function toListFilter(query: HospitalAdminListQuery): HospitalAdminListFilter {
  return {
    keyword: query.keyword,
    status: query.status,
    classCd: query.classCd,
    regionCd: query.regionCd,
  };
}

function toSearchFilter(query: HospitalAdminListQuery): HospitalAdminSearchFilter {
  return {
    keyword: query.keyword,
    regionCds: query.regionCd ? [query.regionCd] : undefined,
    classCds: query.classCd ? [query.classCd] : undefined,
    tiers: query.tier,
    emergency: query.emergency,
    baby: query.baby,
    subjectCds: query.subjectCds,
    specialistCds: query.specialistCds,
    equipmentCds: query.equipmentCds,
    specialtyCds: query.specialtyCds,
    specialCds: query.specialCds,
    asmExcellentCds: query.asmExcellentCds,
  };
}

function toAdminRow(hospital: HealthcareHospital): HospitalAdminRow {
  return {
    id: hospital.id,
    name: hospital.name,
    legalName: hospital.legalName,
    status: hospital.status,
    source: hospital.source,
    ykiho: hospital.ykiho,
    hpid: hospital.hpid,
    classCd: hospital.classCd,
    regionCd: hospital.regionCd,
    tier: hospital.tier,
    addr: hospital.addr,
    tel: hospital.tel,
  };
}
