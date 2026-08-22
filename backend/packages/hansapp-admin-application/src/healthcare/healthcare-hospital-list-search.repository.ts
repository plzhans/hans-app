import { Inject, Injectable } from '@nestjs/common';
import {
  ElasticsearchService,
  HEALTHCARE_HOSPITAL_ALIAS,
  SEARCH_CONFIG,
  aliasOf,
  type SearchConfig,
  type HealthcareHospitalDoc,
} from '@hansapp/search';
import type { QueryDslQueryContainer, Sort } from '@elastic/elasticsearch/lib/api/types';

/**
 * 관리자 상세검색 조건. DB 저장소(HealthcareHospitalListRepository)의 최소 조건에
 * 진료과목·장비·전문분야 등 코드 필터를 더한 것 — 색인된 필드라 EXISTS 서브쿼리 없이
 * terms 로 바로 걸린다.
 *
 * **status 필드가 없다.** 색인기(HealthcareIndexService)가 status='active' 인 병원만
 * 올리므로(healthcare-index.repository.ts countActive 주석 참고), 이 저장소가 내는 행은
 * 항상 활성 병원이다 — 비활성 상태를 보려면 서비스가 engine=db 로 보낸다.
 */
export interface HospitalAdminSearchFilter {
  keyword?: string;
  regionCds?: string[];
  classCds?: string[];
  tiers?: string[];
  emergency?: boolean;
  baby?: boolean;
  subjectCds?: string[];
  specialistCds?: string[];
  equipmentCds?: string[];
  specialtyCds?: string[];
  specialCds?: string[];
  asmExcellentCds?: string[];
}

/** DB(HealthcareHospital 엔티티)와 ES(문서) 양쪽을 같은 모양으로 좁힌 목록 행. */
export interface HospitalAdminRow {
  id: number;
  name: string;
  legalName: string;
  status: string;
  source: string;
  ykiho: string | null;
  hpid: string | null;
  classCd: string | null;
  regionCd: string | null;
  tier: string | null;
  addr: string | null;
  tel: string | null;
}

export interface HospitalAdminSearchPage {
  rows: HospitalAdminRow[];
  total: number;
}

/**
 * healthcare_hospital 관리자 상세검색(ES). 공개 API 의 HealthcareHospitalSearchRepository 와
 * 같은 색인을 읽지만, **관리자용이라 관련도 랭킹·다국어·초성·거리순 같은 사용자 대면
 * 기능은 없다** — 코드 필터로 좁히고 id 순으로 훑는 조회다.
 */
@Injectable()
export class HealthcareHospitalListSearchRepository {
  private readonly alias: string;

  constructor(
    private readonly es: ElasticsearchService,
    @Inject(SEARCH_CONFIG) config: SearchConfig,
  ) {
    this.alias = aliasOf(HEALTHCARE_HOSPITAL_ALIAS, config.indexPrefix);
  }

  async search(
    filter: HospitalAdminSearchFilter,
    page: number,
    size: number,
  ): Promise<HospitalAdminSearchPage> {
    const res = await this.es.client.search<Partial<HealthcareHospitalDoc>>({
      index: this.alias,
      from: (page - 1) * size,
      size,
      track_total_hits: true,
      sort: this.sortOf(filter),
      _source: [
        'id',
        'status',
        'source',
        'ykiho',
        'hpid',
        'name',
        'legal_name',
        'class_cd',
        'tier',
        'tel',
        'location',
      ],
      query: this.buildQuery(filter),
    });

    const total = res.hits.total;
    return {
      rows: res.hits.hits.map((hit) => hitToRow(hit._source ?? {})),
      total: typeof total === 'number' ? total : (total?.value ?? 0),
    };
  }

  private sortOf(filter: HospitalAdminSearchFilter): Sort {
    return filter.keyword ? [{ _score: { order: 'desc' } }, { id: 'asc' }] : [{ id: 'asc' }];
  }

  private buildQuery(filter: HospitalAdminSearchFilter): QueryDslQueryContainer {
    const must: QueryDslQueryContainer[] = [];
    if (filter.keyword) {
      // name.ko/legal_name 은 keyword 타입(정확일치 전용)이라 부분검색이 안 걸린다.
      // 분석기가 붙은 search.name.ko(text, ko_text, index_prefixes)로 찾는다 — legal_name도
      // copy_to로 같은 필드에 들어가 있어(스키마 참고) 이 필드 하나로 병원명·법인명을 다 덮는다.
      must.push({
        match: {
          'search.name.ko': filter.keyword,
        },
      });
    }

    const filterClauses: QueryDslQueryContainer[] = [];
    if (filter.regionCds?.length) {
      filterClauses.push({ terms: { 'location.region_cd': filter.regionCds } });
    }
    if (filter.classCds?.length) {
      filterClauses.push({ terms: { class_cd: filter.classCds } });
    }
    if (filter.tiers?.length) {
      filterClauses.push({ terms: { tier: filter.tiers } });
    }
    if (filter.emergency) {
      filterClauses.push({ term: { emergency: true } });
    }
    if (filter.baby) {
      filterClauses.push({ term: { baby: true } });
    }
    if (filter.subjectCds?.length) {
      filterClauses.push({ terms: { subject_cds: filter.subjectCds } });
    }
    if (filter.specialistCds?.length) {
      filterClauses.push({ terms: { specialist_subject_cds: filter.specialistCds } });
    }
    if (filter.equipmentCds?.length) {
      filterClauses.push({ terms: { equipment_cds: filter.equipmentCds } });
    }
    if (filter.specialtyCds?.length) {
      filterClauses.push({ terms: { specialty_cds: filter.specialtyCds } });
    }
    if (filter.specialCds?.length) {
      filterClauses.push({ terms: { special_cds: filter.specialCds } });
    }
    if (filter.asmExcellentCds?.length) {
      filterClauses.push({ terms: { asm_excellent_cds: filter.asmExcellentCds } });
    }

    return { bool: { must, filter: filterClauses } };
  }
}

function hitToRow(doc: Partial<HealthcareHospitalDoc>): HospitalAdminRow {
  return {
    id: Number(doc.id),
    name: doc.name?.ko ?? '',
    legalName: doc.legal_name ?? doc.name?.ko ?? '',
    // 색인엔 활성 병원만 있다(파일 상단 주석 참고) — 항상 'active'.
    status: doc.status ?? 'active',
    source: doc.source ?? '',
    ykiho: doc.ykiho ?? null,
    hpid: doc.hpid ?? null,
    classCd: doc.class_cd ?? null,
    regionCd: doc.location?.region_cd ?? null,
    tier: doc.tier ?? null,
    addr: doc.location?.addr?.ko ?? null,
    tel: doc.tel ?? null,
  };
}
