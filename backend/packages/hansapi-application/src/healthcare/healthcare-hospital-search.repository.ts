import { Injectable } from '@nestjs/common';
import type { SupportedLang } from '@hansapi/common';
import { INPATIENT_TIERS } from '@hansapi/data/seed';
import {
  ElasticsearchService,
  HEALTHCARE_HOSPITAL_ALIAS,
  type HealthcareHospitalDoc,
} from '@hansapi/search';
import type {
  QueryDslQueryContainer,
  SortResults,
} from '@elastic/elasticsearch/lib/api/types';

import type {
  HospitalListRow,
  HospitalScrollRows,
  HospitalScrollSource,
  HospitalSearchFilter,
} from './healthcare-hospital.repository';

/**
 * 무한 스크롤의 **ES 원천**. DB 저장소(HealthcareHospitalRepository)와 **같은 계약**
 * (HospitalScrollSource)을 구현해, 서비스가 db 플래그로 둘 중 하나를 골라 대행시킨다.
 * 기본은 이쪽(ES)이고, ES 장애 때 db=true 로 DB 저장소로 우회한다.
 *
 * **커서는 search_after 다(PIT 아님).** PIT 은 코디네이터 메모리를 잡는데, 무상태 스크롤엔
 * 과하다. search_after 는 정렬키(여기선 id) 다음부터 잇는 방식이라 상태를 안 남긴다.
 *
 * search_after 값은 이 저장소 밖으로 나가면 쓸모가 없으므로 **여기서만 다룬다** —
 * base64(JSON) 로 인코딩해 nextToken 으로 내보내고, 받을 땐 디코딩해 되돌린다.
 * 반환 행은 DB 경로와 같은 HospitalListRow 모양으로 맞춰, 서비스의 매핑(toSummary)을 한 벌로 공유한다.
 */
@Injectable()
export class HealthcareHospitalSearchRepository implements HospitalScrollSource {
  constructor(private readonly es: ElasticsearchService) {}

  async searchScroll(
    filter: HospitalSearchFilter,
    lang: SupportedLang,
    nextToken: string | undefined,
    size: number,
  ): Promise<HospitalScrollRows> {
    const searchAfter = decodeSearchAfter(nextToken);

    const res = await this.es.client.search<Partial<HealthcareHospitalDoc>>({
      index: HEALTHCARE_HOSPITAL_ALIAS,
      // size+1 로 다음 페이지 유무를 판정한다(DB 경로와 같은 규칙).
      size: size + 1,
      // id 는 유일하므로 이 하나로 전순서가 잡힌다 — search_after 커서가 안정적이다.
      sort: [{ id: 'asc' }],
      search_after: searchAfter,
      track_total_hits: false,
      // 요약에 필요한 필드만 가져온다(상세는 별도 API). 본문 payload 를 줄인다.
      _source: [
        'id',
        'name',
        'tel',
        'emergency',
        'baby',
        'class_cd',
        'tier',
        'specialty_cds',
        'subway',
        'location',
      ],
      query: { bool: { filter: this.buildFilter(filter, lang) } },
    });

    const hits = res.hits.hits;
    const hasMore = hits.length > size;
    const page = hasMore ? hits.slice(0, size) : hits;

    const rows = page.map((hit) => hitToListRow(hit._source ?? {}, lang));
    const lastSort = page[page.length - 1]?.sort;
    return {
      rows,
      nextToken: hasMore && lastSort ? encodeSearchAfter(lastSort) : undefined,
    };
  }

  /**
   * HospitalSearchFilter → ES bool filter 절. **DB buildWhere 와 의미를 맞춘다.**
   * scoring 이 필요없는 조건은 전부 filter 컨텍스트에 둔다(정렬은 id 라 점수 무관).
   */
  private buildFilter(
    filter: HospitalSearchFilter,
    lang: SupportedLang,
  ): QueryDslQueryContainer[] {
    const must: QueryDslQueryContainer[] = [{ term: { status: 'active' } }];

    if (filter.regionCds?.length) {
      // 서비스가 시도→시군구로 이미 편 목록. 시도 코드 자신은 region_cd 와 안 맞지만 하위가 다 걸린다.
      must.push({ terms: { 'location.region_cd': filter.regionCds } });
    }
    if (filter.classCds?.length) {
      must.push({ terms: { class_cd: filter.classCds } });
    }
    if (filter.tiers?.length) {
      must.push({ terms: { tier: filter.tiers } });
    } else {
      // 등급 미지정이면 요양·정신 제외. tier 필드가 없는 문서(기타)는 must_not 에 안 걸려 남는다
      // (= DB 의 tier IS NULL 통과와 등가).
      must.push({
        bool: { must_not: [{ terms: { tier: [...INPATIENT_TIERS] } }] },
      });
    }
    if (filter.name) {
      // 병원명 또는 지하철역·지명. 색인 시 copy_to 로 모아둔 search.name / search.place 를 언어별로 친다.
      must.push({
        bool: {
          should: [
            { match: { [`search.name.${lang}`]: filter.name } },
            { match: { [`search.place.${lang}`]: filter.name } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    if (filter.emergency) {
      must.push({ term: { emergency: true } });
    }
    if (filter.baby) {
      must.push({ term: { baby: true } });
    }
    if (filter.asmExcellentCds?.length) {
      // DB 는 asm_XX 컬럼을 보지만, ES 는 색인 때 계산해 둔 우수 코드 배열을 텀으로 건다.
      must.push({ terms: { asm_excellent_cds: filter.asmExcellentCds } });
    }
    if (filter.specialtyCds?.length) {
      must.push({ terms: { specialty_cds: filter.specialtyCds } });
    }
    if (filter.specialCds?.length) {
      must.push({ terms: { special_cds: filter.specialCds } });
    }
    if (filter.equipmentCds?.length) {
      must.push({ terms: { equipment_cds: filter.equipmentCds } });
    }
    if (filter.subjectCds?.length) {
      must.push({ terms: { subject_cds: filter.subjectCds } });
    }
    if (filter.specialistCds?.length) {
      must.push({ terms: { specialist_subject_cds: filter.specialistCds } });
    }

    return must;
  }
}

/**
 * ES 문서(_source) → HospitalListRow. **DB 경로의 프로젝션과 필드 모양을 똑같이 맞춘다** —
 * 서비스가 listRowToSource·toSummary 를 두 경로에 그대로 재사용하게 하려는 것이다.
 * 이름은 원문(ko)을 name 에, 요청 언어 번역을 i18n_name 에 실어 서비스가 골라 쓰게 한다.
 */
function hitToListRow(
  doc: Partial<HealthcareHospitalDoc>,
  lang: SupportedLang,
): HospitalListRow {
  const loc = doc.location;
  const stations = doc.subway?.stations;
  return {
    id: Number(doc.id),
    name: doc.name?.ko ?? '',
    i18n_name: doc.name?.[lang] ?? null,
    tel: doc.tel ?? null,
    addr: loc?.addr?.ko ?? null,
    post_no: loc?.post_no ?? null,
    lat: loc?.point?.lat ?? null,
    lon: loc?.point?.lon ?? null,
    emergency_yn: doc.emergency ? 1 : 0,
    baby_yn: doc.baby ? 1 : 0,
    emdong_nm: loc?.emdong_nm?.ko ?? null,
    // 역명은 요청 언어가 있으면 그걸, 없으면 한국어 첫 역. 노선은 원문 표기 그대로.
    station: stations?.[lang]?.[0] ?? stations?.ko?.[0] ?? null,
    station_line: doc.subway?.lines?.[0] ?? null,
    class_cd: doc.class_cd ?? null,
    tier: doc.tier ?? null,
    // 전문병원 지정은 병원당 최대 1건이라 첫 값을 쓴다(DB 도 단건 조인).
    specialty_cd: doc.specialty_cds?.[0] ?? null,
    region_cd: loc?.region_cd ?? null,
  };
}

/**
 * search_after 배열 → nextToken. base64(JSON) 로 감싼다 — 커서 내용을 클라이언트가 해석하지 못하게 하고,
 * 정렬키가 여럿(예: 점수+id)으로 늘어도 토큰 형식은 그대로 유지한다.
 */
function encodeSearchAfter(sort: SortResults): string {
  return Buffer.from(JSON.stringify(sort), 'utf8').toString('base64url');
}

/**
 * nextToken → search_after 배열. 비었거나 깨진 토큰은 undefined(처음부터) — 조작된 토큰에
 * 500 을 내지 않고 첫 페이지로 흘린다(DB decodeIdToken 과 같은 태도).
 */
function decodeSearchAfter(token: string | undefined): SortResults | undefined {
  if (!token) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    return Array.isArray(parsed) ? (parsed as SortResults) : undefined;
  } catch {
    return undefined;
  }
}
