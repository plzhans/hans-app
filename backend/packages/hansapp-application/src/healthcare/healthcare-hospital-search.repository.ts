import { Inject, Injectable } from '@nestjs/common';
import type { SupportedLang } from '@hansapp/common';
import { INPATIENT_TIERS } from '@hansapp/data/seed';
import {
  ElasticsearchService,
  HEALTHCARE_HOSPITAL_ALIAS,
  SEARCH_CONFIG,
  aliasOf,
  type SearchConfig,
  type HealthcareHospitalDoc,
} from '@hansapp/search';
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
  /** env 접두사가 붙은 물리 alias(develop-healthcare_hospital). 검색은 이 이름으로만 조회한다. */
  private readonly alias: string;

  constructor(
    private readonly es: ElasticsearchService,
    @Inject(SEARCH_CONFIG) config: SearchConfig,
  ) {
    this.alias = aliasOf(HEALTHCARE_HOSPITAL_ALIAS, config.env);
  }

  async searchScroll(
    filter: HospitalSearchFilter,
    lang: SupportedLang,
    nextToken: string | undefined,
    size: number,
  ): Promise<HospitalScrollRows> {
    const searchAfter = decodeSearchAfter(nextToken);

    const res = await this.es.client.search<Partial<HealthcareHospitalDoc>>({
      index: this.alias,
      // size+1 로 다음 페이지 유무를 판정한다(DB 경로와 같은 규칙).
      size: size + 1,
      // **관련도(_score) 우선, id 로 tie-break.** id 가 유일키라 [_score,id] 가 전순서를 보장해
      // search_after 커서가 안정적이다(단일 샤드라 _score 도 결정적). 키워드가 없으면 모든 문서
      // _score 가 같아 자연히 id 순이 된다 — 기존 동작과 동일하다.
      sort: [{ _score: { order: 'desc' } }, { id: 'asc' }],
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
      query: {
        bool: {
          // 코드 필터는 점수 무관(filter 컨텍스트, 캐시된다).
          filter: this.buildFilter(filter),
          // **키워드는 must(점수 컨텍스트)에 둔다** — 그래야 관련도 정렬이 산다.
          // 키워드가 없으면 must 를 빼서 순수 필터 질의로 둔다(전건 _score 균일 → id 순).
          ...(filter.name
            ? { must: this.keywordQuery(filter.name, lang) }
            : {}),
        },
      },
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
   * 키워드(병원명·지하철역·지명) 질의. **filter 가 아니라 must 로 들어가 관련도(_score)를 만든다.**
   *
   * 색인 시 copy_to 로 모아둔 search.name / search.place 를 언어별로 친다. **이름을 지명보다
   * 위로** 올리려 name 에 부스트(^3)를 준다("혜화역 정형외과" 에서 이름이 딱 맞는 병원이 상단).
   * best_fields — 이름이든 지명이든 가장 잘 맞는 필드의 점수를 취한다.
   */
  private keywordQuery(
    keyword: string,
    lang: SupportedLang,
  ): QueryDslQueryContainer {
    // 입력이 **전부 한글 자음(초성)**이면 초성 검색이다 — 색인해둔 name_chosung 에 prefix 로 건다
    // ("ㅅㅇㅂㅇ" → "서울병원"). 공백은 무시한다(name_chosung 은 공백 없이 색인됨).
    const chosung = keyword.replace(/\s+/g, '');
    if (chosung.length > 0 && /^[ㄱ-ㅎ]+$/.test(chosung)) {
      return { prefix: { name_chosung: chosung } };
    }
    // 일반 키워드: 이름(^3 부스트)·지명을 관련도로 친다.
    return {
      multi_match: {
        query: keyword,
        fields: [`search.name.${lang}^3`, `search.place.${lang}`],
        type: 'best_fields',
      },
    };
  }

  /**
   * HospitalSearchFilter → ES bool filter 절(코드 조건). **DB buildWhere 와 의미를 맞춘다.**
   * 점수가 필요없는 조건만 여기 둔다(filter 컨텍스트, 캐시). 키워드는 keywordQuery 로 must 에 간다.
   */
  private buildFilter(filter: HospitalSearchFilter): QueryDslQueryContainer[] {
    const must: QueryDslQueryContainer[] = [{ term: { status: 'active' } }];

    // id 단건 조회(id:/hira:/nmc:). **다른 조건은 무시**하고 그 id 로만 건다(요양·정신 기본 제외 등에
    // 걸려 단건이 안 나오는 걸 막는다). id 는 long, ykiho/hpid 는 keyword 라 term 이 정확 매칭한다.
    if (filter.id !== undefined || filter.hira || filter.nmc) {
      if (filter.id !== undefined) {
        must.push({ term: { id: filter.id } });
      }
      if (filter.hira) {
        must.push({ term: { ykiho: filter.hira } });
      }
      if (filter.nmc) {
        must.push({ term: { hpid: filter.nmc } });
      }
      return must;
    }

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
