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
import {
  DEFAULT_NEARBY_POLICY,
  NEARBY_TIER_FALLBACK,
  NEARBY_TIER_POLICY,
  type NearbyTierPolicy,
} from './hospital-nearby.constants';

/**
 * 근처 유사 병원 한 행. **목록 행(HospitalListRow)을 물려받아** 서비스가 요약 매핑
 * (listRowToSource·toSummary)을 그대로 재사용하게 하고, 거리와 겹침만 얹는다.
 *
 * **겹침 계산을 저장소가 하는 이유**는 기준 병원 문서를 여기서 읽기 때문이다 — 비교 재료가
 * 여기에만 있다. 저장소는 코드까지만 내고, 이름 현지화·정렬은 서비스가 코드표로 붙인다.
 * 필드 이름이 snake_case 인 것도 물려받은 HospitalListRow 를 따른 것이다(DB 프로젝션 관행).
 */
export interface HospitalNearbyRow extends HospitalListRow {
  /** 기준 병원과의 직선거리(m, 반올림) */
  distance_m: number;

  /** 기준 병원과 겹친 진료과목 코드 */
  matched_subject_cds: string[];

  /**
   * 겹친 과목 중 **양쪽 다 전문의를 보유한** 코드. 색인이 두 배열을 같은 원천(subjects)에서
   * 만들므로 matched_subject_cds 의 부분집합이다.
   */
  matched_specialist_cds: string[];
}

/** 근처 유사 병원 조회 조건. 서비스가 범위를 검증해 넘긴다. */
export interface HospitalNearbyOptions {
  /**
   * 반경(m). **없으면 기준 병원의 등급이 정한다**(NEARBY_TIER_POLICY) — 등급을 알려면 기준
   * 병원 문서를 읽어야 하는데 그건 이 저장소가 하는 일이라, 결정도 여기서 한다.
   */
  radius?: number;
  size: number;
}

/** 근처 유사 병원 조회 결과. 실제 적용한 반경을 함께 낸다(서버가 정했을 수 있다). */
export interface HospitalNearbyRows {
  radius: number;
  rows: HospitalNearbyRow[];
}

/**
 * 후보 질의 한 벌에 필요한 재료. 같은 등급 질의와 보충 질의가 **등급 조건만 다르므로**
 * 나머지를 이 묶음으로 넘겨 한 벌을 공유한다.
 */
interface NearbySearchContext {
  id: number;
  doc: Partial<HealthcareHospitalDoc>;
  origin: { lat: number; lon: number };
  policy: NearbyTierPolicy;
  radius: number;
  lang: SupportedLang;
}

/**
 * 유사도 가중치. 겹치는 만큼 **합산**하고, 그 합에 거리 감쇠를 곱해 순위를 낸다.
 *
 * 절대값에 의미는 없고 **서로의 비율만 의미가 있다.** 조정할 때는 이 표만 보면 된다.
 * 응답에 점수를 싣지 않는 것도 그래서다 — 여기를 손대는 순간 값이 통째로 바뀐다.
 */
const NEARBY_WEIGHT = {
  /** 겹친 진료과목 1개당. "대신 갈 수 있는가" 의 핵심이라 기본 단위로 삼는다. */
  subject: 3,
  /** 겹친 과목에 양쪽 다 전문의가 있으면 추가. 신고만 한 과목보다 실질적이다. */
  specialist: 2,
  /** 전문병원 지정분야 일치. 척추 전문병원 옆의 척추 전문병원을 최상위로 올린다. */
  specialty: 8,
  /**
   * 종별 일치(의원↔의원, 치과의원↔치과의원). **등급 안에서 계열을 가르는 유일한 신호다** —
   * 등급은 필터가 가르므로(같은 등급끼리만 겨룬다) 여기 남는 일은 의과·치과·한방을 나누는 것이다.
   */
  classCd: 4,
  /** 응급실·달빛 일치. **기준 병원이 운영할 때만** 건다(안 하는 병원끼리 맞춰봐야 의미 없다). */
  flag: 2,
  /**
   * 아무것도 안 겹쳐도 남는 바닥 점수. 이게 없으면 전건이 0점이라 거리 감쇠를 곱해도 0이 되어
   * 순위가 무너진다 — 겹침이 없을 때 **거리순으로 곱게 물러나게** 하는 장치다.
   */
  base: 1,
} as const;

/**
 * 감쇠 곡선의 세로축. scale 만큼 멀어졌을 때 남는 가중치다.
 *
 * 0.5 는 "한 scale 마다 반씩" 이라는 뜻이고, offset·scale 이 등급별로 다르므로
 * (NEARBY_TIER_POLICY) **곡선의 모양만 여기서 정한다.**
 */
const NEARBY_DECAY_AT_SCALE = 0.5;

/** 기준 병원에서 읽을 필드. 유사도 질의를 조립하는 데 필요한 것만 가져온다. */
const NEARBY_SEED_SOURCE = [
  'location',
  'class_cd',
  'tier',
  'emergency',
  'baby',
  'subject_cds',
  'specialist_subject_cds',
  'specialty_cds',
];

/** 후보에서 읽을 필드. 요약 매핑용 + 겹침 계산용. */
const NEARBY_SOURCE = [
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
  'subject_cds',
  'specialist_subject_cds',
];

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
    this.alias = aliasOf(HEALTHCARE_HOSPITAL_ALIAS, config.indexPrefix);
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
   * 근처의 유사한 병원. 상세 화면 하단 섹션용이라 **ES 전용이다**(DB 우회 경로가 없다 —
   * 좌표 기반 채점을 SQL 로 옮길 만한 가치가 없고, 섹션 하나가 비는 건 감수할 만하다).
   *
   * **두 번 왕복한다.** 먼저 기준 병원 문서를 읽고(무엇과 비슷한지는 그 문서가 정한다),
   * 그 값으로 후보 질의를 조립한다. 기준 병원의 과목·종별을 모르면 유사도 자체가 성립하지 않아
   * 피할 수 없는 왕복이다. 대신 첫 왕복은 _id 직접 조회(get)라 검색보다 훨씬 싸다.
   *
   * 순위는 `유사도 합산 × 거리 감쇠` 다(NEARBY_WEIGHT·NEARBY_DECAY 참고). 거리로 먼저
   * 정렬하지 않는 이유는 **바로 옆 무관한 병원**이 상단을 먹기 때문이고, 유사도만 쓰지 않는
   * 이유는 반경 끝의 병원이 올라오기 때문이다.
   *
   * 반환이 **null 이면 기준 병원이 색인에 없다**(호출자가 404 로 옮긴다).
   * **빈 목록은 좌표가 없거나 반경 안에 후보가 없다는 뜻**이다 — 둘 다 정상 응답이다.
   */
  async findNearby(
    id: number,
    options: HospitalNearbyOptions,
    lang: SupportedLang,
  ): Promise<HospitalNearbyRows | null> {
    const seed = await this.es.client.get<Partial<HealthcareHospitalDoc>>(
      { index: this.alias, id: String(id), _source: NEARBY_SEED_SOURCE },
      // 없는 병원은 예외가 아니라 결과다 — 404 를 삼키고 found 로 판정한다.
      { ignore: [404] },
    );
    if (!seed?.found || !seed._source) {
      return null;
    }

    const doc = seed._source;
    // **반경·감쇠는 기준 병원의 등급이 정한다**(NEARBY_TIER_POLICY 참고). 클라이언트가
    // 값을 줬으면 그걸 쓰되, 감쇠 폭은 정책 그대로 둔다 — 반경만 넓혀도 곡선은 등급의 것이 맞다.
    const policy = NEARBY_TIER_POLICY[doc.tier ?? ''] ?? DEFAULT_NEARBY_POLICY;
    const radius = options.radius ?? policy.radius;

    const origin = doc.location?.point;
    // 좌표가 없으면 "근처" 를 계산할 근거가 없다. 없는 병원(null)과는 구분해 빈 결과로 낸다.
    if (!origin) {
      return { radius, rows: [] };
    }

    // 같은 등급부터 채운다. 모자라면 인접 등급으로 보충한다(NEARBY_TIER_FALLBACK 참고).
    const rows = await this.searchNearby(
      { id, doc, origin, policy, radius, lang },
      tierFilter(doc.tier),
      options.size,
    );

    const fallback = doc.tier ? NEARBY_TIER_FALLBACK[doc.tier] : undefined;
    if (rows.length >= options.size || !fallback) {
      return { radius, rows };
    }

    const supplement = await this.searchNearby(
      { id, doc, origin, policy, radius, lang },
      [{ term: { tier: fallback } }],
      options.size - rows.length,
    );
    // 같은 등급이 **먼저** 온다. 보충분은 뒤에 붙고, 화면은 각 항목의 tier 로 구분한다.
    return { radius, rows: [...rows, ...supplement] };
  }

  /**
   * 후보 한 벌을 실제로 뽑는다. 같은 등급 질의와 보충 질의가 **등급 조건만 다르고 나머지는 같다** —
   * 반경·감쇠·유사도·정렬을 한 벌로 공유해야 두 묶음이 같은 기준으로 줄 선다.
   */
  private async searchNearby(
    context: NearbySearchContext,
    tierClauses: QueryDslQueryContainer[],
    size: number,
  ): Promise<HospitalNearbyRow[]> {
    const { id, doc, origin, policy, radius, lang } = context;

    const res = await this.es.client.search<Partial<HealthcareHospitalDoc>>({
      index: this.alias,
      size,
      track_total_hits: false,
      _source: NEARBY_SOURCE,
      query: {
        function_score: {
          query: {
            bool: {
              filter: [
                { term: { status: 'active' } },
                {
                  geo_distance: {
                    distance: `${radius}m`,
                    'location.point': origin,
                  },
                },
                ...tierClauses,
              ],
              // 자기 자신은 "다른 병원" 이 아니다.
              must_not: [{ term: { id } }],
              should: this.buildSimilarity(doc),
              // filter 가 있는 bool 은 어차피 0이 기본이지만, should 를 **점수 전용**으로
              // 쓴다는 의도를 못 박아 둔다(나중에 filter 를 빼도 조건이 안 바뀐다).
              minimum_should_match: 0,
            },
          },
          functions: [
            {
              gauss: {
                'location.point': {
                  origin,
                  offset: `${policy.offset}m`,
                  scale: `${policy.scale}m`,
                  decay: NEARBY_DECAY_AT_SCALE,
                },
              },
            },
          ],
          // 유사도 합산에 감쇠를 **곱한다**. 더하면 멀어도 유사도만 높으면 올라와 "근처" 가 깨진다.
          boost_mode: 'multiply',
        },
      },
      /*
        동점을 가르는 순서: **거리 무시 구간으로 뭉갠 거리 → 진료과목 수 → id**.

        실거리로 가르면 **57m 차이가 순위를 뒤집는다.** 실제로 하남 미사에서 후보 열 곳이
        같은 과목을 신고해 점수가 전원 동점이었고, 0m 이비인후과가 57m 소아청소년과를 이겼다.
        걸어서 1분도 안 되는 차이를 순위 근거로 삼은 셈이라, 그 안에서는 우열을 두지 않는다.
        뭉개는 단위는 등급이 정한다(policy.offset) — 감쇠가 거리를 무시하는 구간과 같은 값이다.

        거리대까지 같으면 **진료과목을 덜 늘어놓은 쪽**을 올린다. 기준 병원의 과목을 똑같이
        다 걸고 있는 두 병원이라면, 남는 과목이 적을수록 겹치는 비율이 높다 — 즉 더 닮았다.
        의원은 진료과목을 자유롭게 신고해서 이비인후과가 소아청소년과를 얹어두는 일이 흔한데,
        그 경우 대개 과목 목록이 더 길다.

        마지막 _geo_distance 는 **정렬이 아니라 값을 받으려고** 둔다 — 앞의 id 가 유일키라
        여기서 순서가 더 갈릴 일이 없고, sort[4] 로 계산된 실거리(m)가 딸려 온다
        (script_fields 없이 거리를 얻는 방법이다).
      */
      sort: [
        { _score: { order: 'desc' } },
        {
          _script: {
            type: 'number',
            order: 'asc',
            script: {
              // floor 다 — 0~99m 가 한 칸이 되어야 "100m 안은 같다" 가 된다(ceil 이면 0m 과 57m 이 갈린다).
              source:
                "Math.floor(doc['location.point'].arcDistance(params.lat, params.lon) / params.step)",
              params: {
                lat: origin.lat,
                lon: origin.lon,
                step: policy.offset,
              },
            },
          },
        },
        {
          _script: {
            type: 'number',
            order: 'asc',
            script: { source: "doc['subject_cds'].size()" },
          },
        },
        { id: 'asc' },
        {
          _geo_distance: {
            'location.point': origin,
            order: 'asc',
            unit: 'm',
          },
        },
      ],
    });

    const seedSubjects = new Set(doc.subject_cds ?? []);
    const seedSpecialists = new Set(doc.specialist_subject_cds ?? []);

    return res.hits.hits.map((hit): HospitalNearbyRow => {
      const src = hit._source ?? {};
      return {
        ...hitToListRow(src, lang),
        // sort[4] = _geo_distance 정렬키. unit:'m' 로 요청했으므로 미터다(위 sort 주석 참고).
        distance_m: Math.round(Number(hit.sort?.[4] ?? 0)),
        matched_subject_cds: (src.subject_cds ?? []).filter((cd) =>
          seedSubjects.has(cd),
        ),
        matched_specialist_cds: (src.specialist_subject_cds ?? []).filter(
          (cd) => seedSpecialists.has(cd),
        ),
      };
    });
  }

  /**
   * 유사도 절(should). **기준 병원이 가진 것에 대해서만** 절을 만들어 겹치는 만큼 점수를 쌓는다.
   *
   * 그래서 점수 상한이 **기준 병원의 규모로 묶인다** — 과목 30개짜리 상급종합이 근처에 있어도
   * 기준이 의원이면 겹칠 수 있는 건 그 의원의 과목뿐이라 점수를 독식하지 못한다.
   *
   * 각 절을 constant_score 로 감싸 **BM25 를 걷어낸다.** 안 그러면 희소한 과목이 IDF 로 더 높은
   * 점수를 받아 가중치 표(NEARBY_WEIGHT)와 실제 순위가 어긋난다 — 표를 보고 조정할 수 없게 된다.
   */
  private buildSimilarity(
    doc: Partial<HealthcareHospitalDoc>,
  ): QueryDslQueryContainer[] {
    const should: QueryDslQueryContainer[] = [
      // 바닥 점수. 겹침이 없어도 거리순으로 물러나게 한다.
      {
        constant_score: {
          filter: { match_all: {} },
          boost: NEARBY_WEIGHT.base,
        },
      },
    ];

    const add = (field: string, value: string | boolean, boost: number) => {
      should.push({
        constant_score: { filter: { term: { [field]: value } }, boost },
      });
    };

    for (const cd of doc.subject_cds ?? []) {
      add('subject_cds', cd, NEARBY_WEIGHT.subject);
    }
    for (const cd of doc.specialist_subject_cds ?? []) {
      add('specialist_subject_cds', cd, NEARBY_WEIGHT.specialist);
    }
    for (const cd of doc.specialty_cds ?? []) {
      add('specialty_cds', cd, NEARBY_WEIGHT.specialty);
    }
    if (doc.class_cd) {
      add('class_cd', doc.class_cd, NEARBY_WEIGHT.classCd);
    }
    // 기준 병원이 운영할 때만 건다. 둘 다 응급실이 없는 걸 "닮았다" 고 볼 이유가 없다.
    if (doc.emergency) {
      add('emergency', true, NEARBY_WEIGHT.flag);
    }
    if (doc.baby) {
      add('baby', true, NEARBY_WEIGHT.flag);
    }

    return should;
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
 * 등급 필터 절. **같은 등급끼리만 겨루게 한다** — 상급종합을 보다가 의원이 뜨면 곤란하고,
 * 그 반대도 마찬가지다. 등급을 보는 목적 자체가 다르기 때문이다.
 *
 * 기준 병원의 등급을 모르면(기타) 예전 규칙으로 돌아간다 — 요양·정신만 뺀다.
 * 그 둘은 장기 입원 시설이라 외래 검색에 섞이면 방해다.
 */
function tierFilter(tier: string | undefined): QueryDslQueryContainer[] {
  if (!tier) {
    return [
      { bool: { must_not: [{ terms: { tier: [...INPATIENT_TIERS] } }] } },
    ];
  }
  return [{ term: { tier } }];
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
