/**
 * 병원 ES 문서(정본 매핑 구조). packages/hansapp-search/src/schema/index-template.healthcare_hospital.json 과
 * 짝을 이룬다 — 이 타입이 바뀌면 매핑도 같이 본다.
 *
 * **이 파일은 ES 문서의 "모양"만 정의한다(출력 계약).** DB 원본 행을 이 모양으로 조립하는
 * 변환기(buildHealthcareHospitalDoc)는 DB 를 아는 admin 계층이 소유한다 — search 는 DB 를 모른다.
 * admin 의 빌더가 이 타입을 어기면 컴파일 에러로 잡히므로 매핑과의 정합성은 타입이 강제한다.
 *
 * **코드값만 담는다.** 종별·과목·지역 이름은 앱 캐시가 붙이므로 여기 넣지 않는다(재색인 회피).
 * search.* 는 copy_to 로 색인 시점에 ES 가 채우므로 문서에 넣지 않는다(색인 전용 필드).
 */

/** 지원 언어. 문서의 언어맵(name·intro…)이 이 집합으로 키를 잡는다. 빌더(admin)도 같은 집합을 쓴다. */
export const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export type LangMap = Partial<Record<Lang, string>>;
export type LangListMap = Partial<Record<Lang, string[]>>;

export interface HealthcareHospitalDoc {
  id: number;
  status: string;
  source: string;
  ykiho?: string;
  hpid?: string;

  name: LangMap;

  /** 한국어 이름의 초성 문자열("서울병원"→"ㅅㅇㅂㅇ"). 초성 검색용, 한글만(비한글은 버린다). */
  name_chosung?: string;

  subway?: {
    stations?: LangListMap;
    lines?: string[];
  };

  location: {
    sido_cd?: string;
    region_cd?: string;
    emdong_nm?: { ko?: string };
    post_no?: string;
    addr?: { ko?: string; en?: string };
    point?: { lat: number; lon: number };
  };

  class_cd?: string;
  tier?: string;

  tel?: string;
  emergency: boolean;
  baby: boolean;

  subject_cds: string[];
  specialist_subject_cds: string[];
  equipment_cds: string[];
  specialty_cds: string[];
  special_cds: string[];
  severe_cds: string[];
  /**
   * 적정성평가 우수(1등급) 항목 코드. **다중선택 필터·facet**용(terms).
   * (우수 "개수"가 필요하면 asm_grade_counts.1 을 쓴다 — 별도 필드로 중복 저장하지 않는다.)
   */
  asm_excellent_cds: string[];
  /**
   * **검색용** — 항목별 등급을 숫자로(1=최고 ~ 5). 색인되어 **항목별 정렬·범위필터**가 된다
   * (예: `sort asm_grades.18 asc` = 폐렴 좋은 순, `range asm_grades.18 <= 2`).
   * 천식(16) '양호'→1. **'등급제외'·미평가는 뺀다**(숫자 등급 아님) → 정렬 시 missing 버킷.
   */
  asm_grades?: Record<string, number>;
  /**
   * **검색용** — 등급별 항목 개수(등급→개수). 색인되어 "1·2등급 많은 병원 위로" 같은
   * 정렬·부스팅·범위필터에 쓴다 (예: `sort asm_grade_counts.1 desc`,
   * `range asm_grade_counts.1 >= 5`, script_score 로 등급 가중합). 0인 등급은 뺀다(→ missing=0).
   */
  asm_grade_counts?: Record<string, number>;
  /**
   * **표시용** — 등급 원본 문자열 그대로(색인 안 함). '등급제외'·'양호' 같은 라벨을 화면에
   * 보여주기 위함. 검색·정렬은 asm_grades(숫자)로 하고, 이건 표시 전용이다.
   */
  asm_grades_raw?: Record<string, string>;

  subjects: {
    cd: string;
    declared: boolean;
    doctorCnt?: number;
    specialistCnt?: number;
  }[];
  equipments: { cd: string; cnt?: number }[];
  capabilities: { tp: string; cd: string }[];
  hours: {
    kind: string;
    day: number;
    open?: string;
    close?: string;
    breakStart?: string;
    breakEnd?: string;
  }[];
  staff?: Record<string, number>;
  beds?: Record<string, number>;
  parking?: { capacity?: number; paid?: boolean };

  homepage?: string;
  estb_dd?: string;

  intro?: LangMap;
  notice?: LangMap;
  directions?: LangMap;

  transport?: Partial<Record<Lang, unknown>>;

  built_at: string;
}
