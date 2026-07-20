/**
 * 통합 병원 조회 결과.
 *
 * healthcare_* 테이블을 그대로 반영한다. 원본(HIRA/NMC)의 흔적은 sources 블록에만 남는다 —
 * 대외 사용자는 "어느 정부기관 데이터인지" 알 필요가 없다.
 */

/** 출처 추적. 원본을 직접 확인해야 할 때만 쓴다. */
export interface HospitalSources {
  /** HIRA 요양기호. NMC 에만 있는 병원이면 없다. */
  ykiho?: string;

  /** NMC 기관ID. HIRA 에만 있는 병원이면 없다. */
  hpid?: string;
}

export interface HospitalCode {
  code: string;
  name: string;
}

export interface HospitalRegion {
  /** 시군구 코드 */
  code: string;
  name: string;

  /** 시도 */
  sido?: HospitalCode;

  /** 읍면동. HIRA 만 주고 코드가 없어 이름 그대로다. */
  emdong?: string;
}

export interface HospitalLocation {
  address?: string;
  postNo?: string;
  region?: HospitalRegion;
  lat?: number;
  lon?: number;

  /**
   * 가장 가까운 지하철역. 교통정보의 첫 지하철 항목에서 뽑는다.
   *
   * **한국에서 지하철역은 위치를 가늠하는 1차 기준이다.** 목록에서 "서울 종로구" 보다
   * "혜화역" 이 훨씬 빨리 위치를 알려준다. 거리는 따지지 않는다 — 원본이 거리와 소요시간을
   * 섞어 쓰고 비워두기도 해서, 걸러내면 멀쩡한 역세권 병원이 대거 빠진다.
   */
  station?: string;

  /**
   * 그 역이 어느 노선인가. `station` 과 **같은 항목(subway[0])에서 뽑는다** — 따로 고르면
   * 역과 노선이 어긋난다.
   *
   * 원문 그대로다("2호선", "1,4호선", "인천지하철1호선"). 노선색을 칠하려면 이름이 필요한데
   * 정규화는 화면이 한다 — 자유 입력이라 못 알아보는 값이 나오고, 그때 어떻게 물러날지는
   * 화면마다 다르다(목록은 숨기고 상세는 원문을 보여준다).
   */
  stationLine?: string;
}

/**
 * 진료과목.
 *
 * **진료과목과 표시과목은 다르다.**
 *   진료과목  declared = true          병원이 신고한 과목. 의사가 0명이어도 등재된다.
 *   표시과목  specialistCount > 0      전문의가 실제로 있는 과목.
 */
export interface HospitalSubject {
  code: string;
  name: string;

  /** 신고한 과목인가 */
  declared: boolean;

  /** 과목별 의사수. **겸직이 중복 계산된다. 합산하지 마라.** 총원은 staff.doctorTotal 이다. */
  doctorCount?: number;

  /** 과목별 전문의수. 0보다 크면 표시과목이다. */
  specialistCount?: number;
}

/** 인력. **총원이다** — 과목별 인원의 합과 다르다(겸직). */
export interface HospitalStaff {
  doctorTotal?: number;
  specialist?: number;
  resident?: number;
  intern?: number;
  generalDoctor?: number;
  dentist?: number;
  oriental?: number;
  midwife?: number;
}

/** 병상. 규모기관만 있다 (의원급은 전부 0이라 만들지 않는다). */
export interface HospitalBeds {
  total?: number;
  standard?: number;
  higher?: number;
  icu?: number;
  emergency?: number;
  operatingRoom?: number;
  delivery?: number;
  neonatal?: number;
  isolation?: number;
  psyOpen?: number;
  psyClosed?: number;
}

export interface HospitalEquipment {
  code: string;
  name: string;
  count?: number;
}

/** 역량. 이 병원이 무엇을 할 수 있나. */
export interface HospitalCapability {
  /** severe(중증처치) | specialty(전문병원) | special(특수진료) */
  type: string;
  code: string;
  name?: string;
}

/** 병원평가 항목 하나의 결과. */
export interface HospitalAssessmentItem {
  /** 심평원 평가항목 번호 ('01','03'…). */
  code: string;

  /** 항목명. 요청 언어로 온다(번역이 없으면 한국어). 번역은 심평원이 아니라 우리가 붙인 것이다. */
  name: string;

  /**
   * 등급. 원본 그대로다. `'1'`~`'5'` | `'등급제외'` | `'양호'` | `'0'`.
   *
   * **1 이 가장 좋고 5 가 가장 나쁘다.** `'등급제외'` 는 평가는 했으나 등급을 안 매긴 것이다
   * (평가대상이 아닌 항목은 아예 목록에 없다 — 둘은 다르다).
   *
   * **천식(code='16')만 인코딩이 다르다.** 1등급을 `'양호'` 로, 등급제외를 `'0'` 으로 준다.
   * 그래서 `grade` 를 숫자로 파싱해 정렬하지 마라 — 천식의 `'0'` 이 최상위로 올라간다.
   * 비교가 필요하면 normalized 를 써라.
   */
  grade: string;

  /**
   * 등급을 항목 간 비교 가능하게 옮긴 값. 1~5 또는 `'X'`(등급제외).
   * 천식의 `'양호'`→`1`, `'0'`→`'X'` 가 여기서 흡수된다.
   */
  normalized: number | 'X';
}

/**
 * 병원평가 그룹 하나. 심평원 홈페이지의 묶음(급성질환·만성질환…)을 그대로 따른다.
 *
 * **항목이 하나라도 있는 그룹만 온다.** 평가대상이 아닌 항목은 원본에 키가 없어
 * 애초에 담기지 않는다.
 */
export interface HospitalAssessmentGroup {
  /** 그룹 코드 ('asm01'…). */
  code: string;
  name: string;
  items: HospitalAssessmentItem[];
}

/**
 * 심평원 병원평가 정보.
 *
 * **심평원이 직접 평가하고 등급을 부여한 것**이다(요양급여 적정성 평가). 우리가 만든 값도,
 * 병원이 신고한 값도 아니다. 그래서 다른 섹션(진료과목·병상·장비 = 병원의 속성)과 성격이 다르고,
 * 화면에도 출처를 밝히는 게 맞다.
 *
 * **HIRA 연동이 있는 병원만 온다.** ykiho 가 없으면(NMC 만 있는 병원) 이 섹션 자체가 없다.
 * ykiho 가 있어도 평가대상이 아니면 없다 — 79,739개 중 36,599개만 평가대상이다.
 *
 * 항목마다 평가대상 종별이 다르다. 상급종합에 천식(16)이 없는 건 "천식을 못 본다" 가 아니라
 * "천식 평가 대상이 아니다" 는 뜻이다.
 */
export interface HospitalAssessment {
  /** 그룹별 평가 결과. 그룹은 심평원 홈페이지 노출 순서다. */
  groups: HospitalAssessmentGroup[];
}

/**
 * 진료시간.
 *
 * kind 가 핵심이다. 달빛어린이병원은 **일반 진료와 다른 시간대**에 아이를 받는다.
 *   연세의원  general 09:00~19:00 (누구나) · baby 18:00~23:00 (소아)
 * 하나로 합쳐 보여주면 성인이 21시에 갔다가 헛걸음한다.
 */
export interface HospitalHours {
  /** general(일반 진료) | baby(달빛어린이) */
  kind: string;

  /** 1~7 = 월~일, 8 = 공휴일 */
  day: number;

  open?: string;
  close?: string;
  breakStart?: string;
  breakEnd?: string;
}

/** 목록용 요약 */
export interface HospitalSummary {
  id: number;
  name: string;

  /** 종별. 의원 · 종합병원 · 치과의원 … */
  category?: HospitalCode;

  /**
   * 병원 등급. TIER1(의원급) | TIER2(병원급) | TIER3(상급종합) | NURSING | MENTAL.
   * 종별에서 유도한 값이다 — 의료법이 병상 수로 종별을 규정하므로 등급이 종별에 이미 들어 있다.
   */
  tier?: HospitalCode;

  /**
   * 전문병원 지정분야. 보건복지부 지정이라 병원당 최대 1건이다(관절·척추·심장 …).
   * 목록에서 "척추 전문병원" 배지로 쓴다. capabilities(tp='specialty')를 요약한 것이다.
   */
  specialty?: HospitalCode;
  location: HospitalLocation;
  tel?: string;

  /** 응급실 운영 */
  emergency: boolean;

  /** 달빛어린이병원 */
  baby: boolean;
}

/**
 * 교통편 하나.
 *
 * 원본(HIRA)에 코드 체계가 없다. 전부 병원이 적어 넣은 문자열이라 그대로 내보낸다 —
 * 가공하면 틀린다. 필드 이름과 실제 내용이 어긋나는 것도 있다(dir 참고).
 */
export interface HospitalTransportRoute {
  /** 교통편 원문. "지하철", "마을버스", "시내버스" — 화면 표기에 쓴다. */
  kindName?: string;

  /** 노선. "4호선", "36,39 번" — 여러 노선이 한 문자열로 오기도 한다. */
  line?: string;

  /** 하차지점. "안평역 하차", "기장시장or부산은행앞" */
  arrival?: string;

  /** 이름은 방향이지만 실제로는 이용 안내가 온다. "마을버스11번 or 택시이용" */
  dir?: string;

  /** 거리 **또는 소요시간**. "500m", "5분~10분 소요" — 단위가 제각각이라 계산하지 마라. */
  distance?: string;

  /** 비고. "병원 셔틀버스 이용" */
  note?: string;
}

/**
 * 교통편. 수단별로 묶여 있다.
 *
 * **"대중교통" 이 아니다.** 실물에 자가용(208건)·기차(32건)가 섞여 온다.
 * 화면 제목을 "대중교통" 으로 달면 거짓말이 된다.
 *
 * **directions(찾아오는 길)와도 별개다.** 하나는 병원이 쓴 문장(NMC),
 * 이건 심평원이 준 표(HIRA)라서 내용이 서로 어긋나는 경우가 많다.
 */
export interface HospitalTransport {
  /** trafNm='지하철' */
  subway: HospitalTransportRoute[];

  /** 시내버스·마을버스·시외/고속버스가 모두 여기 들어온다. 구분은 kindName 으로 한다. */
  bus: HospitalTransportRoute[];

  /** 자가용·기차·기타. 대중교통이 아닌 것도 있다. */
  etc: HospitalTransportRoute[];
}

/** 상세 */
export interface HospitalParking {
  /** 주차 가능대수 */
  capacity?: number;

  /** 유료 여부 */
  paid?: boolean;

  note?: string;
}

export interface HospitalDetail extends HospitalSummary {
  /**
   * 병원명의 한국어 원문. **번역이 실제로 있을 때만 온다.**
   *
   * 외국인이 영문 상세 링크를 한국인 지인에게 보냈을 때, 받은 사람이 언어를 바꾸지 않고도
   * 어느 병원인지 알아보게 하려는 것이다. 간판도 지도 검색도 한국어라 번역만으로는
   * 현실 세계와 연결되지 않는다.
   *
   * 한국어로 볼 때나 아직 번역이 없을 때는 **필드 자체가 없다** — name 이 이미 한국어라
   * 병기하면 같은 이름이 두 번 나온다. 프론트는 `{nameKo && …}` 로 끝난다.
   */
  nameKo?: string;

  sources: HospitalSources;
  homepage?: string;

  /** 개설일자 (YYYYMMDD) */
  establishedAt?: string;

  /** 병원 소개·진료 안내 */
  intro?: string;

  /**
   * 기타 안내. **구조화된 진료시간이 못 담는 예외**가 자유 텍스트로 온다.
   * "접수시간: 평일 08:30~17:00", "신정·구정·추석 당일 휴진" 등.
   */
  notice?: string;

  /** 찾아오는 길. 병원이 쓴 문장이다. transport 와 별개다. */
  directions?: string;

  /** 대중교통. 없으면 빈 목록이 담긴 객체다 (undefined 가 아니다). */
  transport: HospitalTransport;

  parking?: HospitalParking;

  subjects: HospitalSubject[];
  hours: HospitalHours[];
  staff?: HospitalStaff;
  beds?: HospitalBeds;
  equipments: HospitalEquipment[];
  capabilities: HospitalCapability[];

  /**
   * 심평원 병원평가. **HIRA 연동(ykiho)이 있고 평가대상인 병원만 온다.**
   * 없으면 필드 자체가 없다 — 프론트는 `{assessment && …}` 로 끝난다.
   */
  assessment?: HospitalAssessment;
}

/** 목록 조회 조건 */
export interface HospitalSearchCommand {
  page: number;
  size: number;

  /**
   * 지역 코드. **시도·시군구 둘 다 받는다.**
   *
   * 병원은 시군구 코드만 갖는다(region_cd). 그런데 사용자는 시도만 고르고 검색하는 경우가
   * 훨씬 많다 — "서울 어디든" 이 자연스러운 첫 조건이다. 시도 코드를 받으면 그 시도에 속한
   * 시군구 전체로 확장해서 건다.
   */
  regionCd?: string;

  /** 종별 코드. healthcare_code(tp='class') 의 cd. 여러 개면 OR. */
  classCds?: string[];

  /**
   * 병원 등급. TIER1(의원급) | TIER2(병원급) | TIER3(상급종합) | NURSING | MENTAL. 여러 개면 OR.
   *
   * **비워두면 NURSING·MENTAL 이 빠진다.** 장기 입원 시설이라 외래 검색에 섞이면 방해다.
   * `tier=NURSING` 으로 직접 지정하면 나온다 — 숨기는 게 아니라 기본값에서 빼는 것이다.
   *
   * 종별에서 유도해 빌드 때 컬럼에 넣어 뒀다. 조회 시점에 종별을 IN 절로 나열하지 않는다.
   */
  tiers?: string[];

  /**
   * 진료과목 코드. healthcare_code(tp='subject') 의 cd. 여러 개면 OR.
   *
   * 진료 분야 그룹(치과·한방 등)은 클라이언트가 메타에서 받아 **코드로 펼쳐서** 넘긴다.
   * 그래서 이 API 는 그룹을 모른다 — 분류가 바뀌어도 검색은 안 바뀐다.
   */
  subjectCds?: string[];

  /**
   * 전문의 있는 과목 코드. subjectCds 와 같은 진료과목 코드지만 **그 과목 전문의를 실제로 보유한**
   * 병원만 건다(specialist_cnt > 0). subjectCds 는 신고만 하면 걸리는 것과 다르다. 여러 개면 OR.
   */
  specialistCds?: string[];

  /** 병원명 (부분 일치) */
  name?: string;

  /** 응급실 운영 병원만 */
  emergency?: boolean;

  /** 달빛어린이병원만 */
  baby?: boolean;

  /**
   * 적정성평가 항목 코드(원본 asmGrd 번호: '01','12','20' …). 그 항목에서 1등급(우수)인 병원.
   * 여러 개면 OR(하나라도 1등급). 미러 hira_hospital_asm 을 조인해 건다.
   */
  asmItemCds?: string[];

  /** 전문병원 지정분야 코드. healthcare_hospital_capability(tp='specialty'). 여러 개면 OR. */
  specialtyCds?: string[];

  /** 특수진료 코드. healthcare_hospital_capability(tp='special'). 여러 개면 OR. */
  specialCds?: string[];

  /** 보유장비 코드. healthcare_hospital_equipment. 여러 개면 OR. */
  equipmentCds?: string[];
}
