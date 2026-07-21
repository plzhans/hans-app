/**
 * 병원 ES 문서(정본 매핑 구조). packages/hansapi-search/src/schema/index-template.healthcare_hospital.json 과
 * 짝을 이룬다 — 이 타입이 바뀌면 매핑도 같이 본다.
 *
 * **코드값만 담는다.** 종별·과목·지역 이름은 앱 캐시가 붙이므로 여기 넣지 않는다(재색인 회피).
 * search.* 는 copy_to 로 색인 시점에 ES 가 채우므로 문서에 넣지 않는다(색인 전용 필드).
 */

const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh'] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

/** 천식만 1등급을 '양호' 로 표기한다(원본 인코딩). 나머지는 '1'. */
const ASTHMA_ASM_CODE = '16';

type LangMap = Partial<Record<Lang, string>>;
type LangListMap = Partial<Record<Lang, string[]>>;

export interface HealthcareHospitalDoc {
  id: number;
  status: string;
  source: string;
  ykiho?: string;
  hpid?: string;

  name: LangMap;

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

// ── 저장소가 넘기는 입력 행(Prisma 결과를 구조적으로만 받는다) ──────────────────

export interface SubjectRow {
  subjectCd: string;
  declared: boolean;
  doctorCnt: number | null;
  specialistCnt: number | null;
}
export interface EquipmentRow {
  equipmentCd: string;
  cnt: number | null;
}
export interface CapabilityRow {
  tp: string;
  cd: string;
}
export interface HoursRow {
  kind: string;
  day: number;
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}
export interface StaffRow {
  doctorTotal: number | null;
  specialist: number | null;
  resident: number | null;
  intern: number | null;
  generalDoctor: number | null;
  dentist: number | null;
  oriental: number | null;
  midwife: number | null;
}
export interface BedRow {
  total: number | null;
  standard: number | null;
  higher: number | null;
  icu: number | null;
  emergency: number | null;
  operatingRoom: number | null;
  delivery: number | null;
  neonatal: number | null;
  isolation: number | null;
  psyOpen: number | null;
  psyClosed: number | null;
}
export interface I18nRow {
  lang: string;
  name: string | null;
  intro: string | null;
  notice: string | null;
  directions: string | null;
  transport: unknown;
}
export interface HealthcareHospitalBaseRow {
  id: number;
  ykiho: string | null;
  hpid: string | null;
  source: string;
  name: string;
  addr: string | null;
  tel: string | null;
  homepage: string | null;
  classCd: string | null;
  regionCd: string | null;
  emdongNm: string | null;
  postNo: string | null;
  lat: unknown;
  lon: unknown;
  estbDd: string | null;
  intro: string | null;
  notice: string | null;
  directions: string | null;
  parkQty: number | null;
  parkPaid: boolean | null;
  transport: unknown;
  emergencyYn: boolean;
  babyYn: boolean;
  tier: string | null;
  status: string;
  builtAt: Date;
  subjects: SubjectRow[];
  equipments: EquipmentRow[];
  capabilities: CapabilityRow[];
  hours: HoursRow[];
  staff: StaffRow | null;
  beds: BedRow | null;
}

/** 저장소가 한 병원에 대해 모아 넘기는 원천. asm 은 asm_01~24 를 담은 평탄 맵. */
export interface HealthcareHospitalIndexRow {
  hospital: HealthcareHospitalBaseRow;
  i18n: I18nRow[];
  asm: Record<string, string | null> | null;
}

// ── 빌더 ──────────────────────────────────────────────────────────────────

/**
 * DB 원천 → ES 문서. 파생 계산(시도 롤업·asm 우수·지하철 역/호선·언어별 텍스트)이 여기 모인다.
 * regionParents: 시군구 cd → 시도 cd (RegionCache 대신 저장소가 1회 로드해 넘긴다).
 */
export function buildHealthcareHospitalDoc(
  row: HealthcareHospitalIndexRow,
  regionParents: Map<string, string>,
): HealthcareHospitalDoc {
  const h = row.hospital;

  const capByTp = (tp: string): string[] =>
    uniq(row.hospital.capabilities.filter((c) => c.tp === tp).map((c) => c.cd));

  const subwayKo = subwayFrom(h.transport);

  // 우수(1등급) 항목: 코드 배열(필터용)과 개수(점수·정렬·부스팅용)를 한 번에 낸다.
  const asmExcellentCds = asmExcellent(row.asm);
  // 항목별 숫자 등급은 한 번만 계산해 asm_grades·asm_grade_counts 가 공유한다.
  const asmGrades = asmNumericGrades(row.asm);

  const doc: HealthcareHospitalDoc = {
    id: h.id,
    status: h.status,
    source: h.source,
    ykiho: h.ykiho ?? undefined,
    hpid: h.hpid ?? undefined,

    name: langText({ ko: h.name }, row.i18n, 'name'),

    subway: buildSubway(h.transport, row.i18n),

    location: buildLocation(h, regionParents),

    class_cd: h.classCd ?? undefined,
    tier: h.tier ?? undefined,

    tel: h.tel ?? undefined,
    emergency: Boolean(h.emergencyYn),
    baby: Boolean(h.babyYn),

    subject_cds: uniq(h.subjects.map((s) => s.subjectCd)),
    specialist_subject_cds: uniq(
      h.subjects
        .filter((s) => (s.specialistCnt ?? 0) > 0)
        .map((s) => s.subjectCd),
    ),
    equipment_cds: uniq(h.equipments.map((e) => e.equipmentCd)),
    specialty_cds: capByTp('specialty'),
    special_cds: capByTp('special'),
    severe_cds: capByTp('severe'),
    asm_excellent_cds: asmExcellentCds,
    asm_grades: asmGrades,
    asm_grade_counts: asmGradeCounts(asmGrades),
    asm_grades_raw: rawAsmGrades(row.asm),

    subjects: h.subjects.map((s) => ({
      cd: s.subjectCd,
      declared: Boolean(s.declared),
      doctorCnt: numOrUndef(s.doctorCnt),
      specialistCnt: numOrUndef(s.specialistCnt),
    })),
    equipments: h.equipments.map((e) => ({
      cd: e.equipmentCd,
      cnt: numOrUndef(e.cnt),
    })),
    capabilities: h.capabilities.map((c) => ({ tp: c.tp, cd: c.cd })),
    hours: h.hours.map((x) => ({
      kind: x.kind,
      day: x.day,
      open: x.openTime ?? undefined,
      close: x.closeTime ?? undefined,
      breakStart: x.breakStart ?? undefined,
      breakEnd: x.breakEnd ?? undefined,
    })),
    staff: h.staff
      ? compact(h.staff as unknown as Record<string, number | null>)
      : undefined,
    beds: h.beds
      ? compact(h.beds as unknown as Record<string, number | null>)
      : undefined,
    parking: buildParking(h),

    homepage: h.homepage ?? undefined,
    estb_dd: h.estbDd ?? undefined,

    intro: emptyToUndef(langText({ ko: h.intro }, row.i18n, 'intro')),
    notice: emptyToUndef(langText({ ko: h.notice }, row.i18n, 'notice')),
    directions: emptyToUndef(
      langText({ ko: h.directions }, row.i18n, 'directions'),
    ),

    transport: buildTransport(h.transport, row.i18n),

    built_at: h.builtAt.toISOString(),
  };

  // 미확보 지하철 정보는 필드 자체를 뺀다(빈 오브젝트로 문서를 채우지 않는다).
  if (!subwayKo.stations.length && !subwayKo.lines.length) {
    // 번역 역명이 있을 수도 있으니 stations 언어맵이 비었을 때만 뺀다.
    if (!doc.subway?.stations && !doc.subway?.lines?.length) {
      delete doc.subway;
    }
  }

  return doc;
}

// ── 파생 헬퍼 ─────────────────────────────────────────────────────────────

function buildLocation(
  h: HealthcareHospitalBaseRow,
  regionParents: Map<string, string>,
): HealthcareHospitalDoc['location'] {
  const lat = num(h.lat);
  const lon = num(h.lon);
  const sido = h.regionCd ? regionParents.get(h.regionCd) : undefined;

  return {
    sido_cd: sido,
    region_cd: h.regionCd ?? undefined,
    emdong_nm: h.emdongNm ? { ko: h.emdongNm } : undefined,
    post_no: h.postNo ?? undefined,
    addr: h.addr ? { ko: h.addr } : undefined,
    // geo_point 는 lat/lon 둘 다 있어야 색인된다 — 하나라도 없으면 필드를 뺀다.
    point: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
  };
}

function buildParking(
  h: HealthcareHospitalBaseRow,
): HealthcareHospitalDoc['parking'] {
  const capacity = numOrUndef(h.parkQty);
  const paid = h.parkPaid === null ? undefined : Boolean(h.parkPaid);
  if (capacity === undefined && paid === undefined) {
    return undefined;
  }
  return { capacity, paid };
}

/** 원문(base)에 언어별 번역(i18n[field])을 얹은 언어맵. 값이 있는 언어만 담는다. */
function langText(
  base: { ko?: string | null },
  i18n: I18nRow[],
  field: 'name' | 'intro' | 'notice' | 'directions',
): LangMap {
  const out: LangMap = {};
  if (base.ko) {
    out.ko = base.ko;
  }
  for (const row of i18n) {
    const value = row[field];
    if (value && isLang(row.lang)) {
      out[row.lang] = value;
    }
  }
  return out;
}

/** 지하철 역이름(언어별) + 호선(정확 필터). 역명은 번역, 호선은 원문 표기 그대로. */
function buildSubway(
  transportKo: unknown,
  i18n: I18nRow[],
): HealthcareHospitalDoc['subway'] {
  const ko = subwayFrom(transportKo);
  const stations: LangListMap = {};
  if (ko.stations.length) {
    stations.ko = ko.stations;
  }
  for (const row of i18n) {
    if (!isLang(row.lang) || row.lang === 'ko') {
      continue;
    }
    const t = subwayFrom(row.transport);
    if (t.stations.length) {
      stations[row.lang] = t.stations;
    }
  }

  const subway: NonNullable<HealthcareHospitalDoc['subway']> = {};
  if (Object.keys(stations).length) {
    subway.stations = stations;
  }
  if (ko.lines.length) {
    subway.lines = ko.lines;
  }
  return Object.keys(subway).length ? subway : undefined;
}

/** transport JSON 에서 지하철 역이름(arrival)·호선(line)을 뽑는다. */
function subwayFrom(transport: unknown): {
  stations: string[];
  lines: string[];
} {
  const subway = readSubwayArray(transport);
  return {
    stations: uniq(
      subway.map((s) => cleanStr(s.arrival)).filter((v): v is string => !!v),
    ),
    lines: uniq(
      subway.map((s) => cleanStr(s.line)).filter((v): v is string => !!v),
    ),
  };
}

function readSubwayArray(
  transport: unknown,
): { arrival?: unknown; line?: unknown }[] {
  if (!transport || typeof transport !== 'object') {
    return [];
  }
  const subway = (transport as { subway?: unknown }).subway;
  return Array.isArray(subway)
    ? (subway as { arrival?: unknown; line?: unknown }[])
    : [];
}

/** 상세 표시용 transport(언어별 원본 JSON 그대로). 색인 안 함(enabled:false). */
function buildTransport(
  transportKo: unknown,
  i18n: I18nRow[],
): HealthcareHospitalDoc['transport'] {
  const out: Partial<Record<Lang, unknown>> = {};
  if (transportKo) {
    out.ko = transportKo;
  }
  for (const row of i18n) {
    if (isLang(row.lang) && row.lang !== 'ko' && row.transport) {
      out[row.lang] = row.transport;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** asm_01~24 중 1등급(우수) 항목 코드만. 천식(16)은 '양호' 가 1등급. */
function asmExcellent(asm: Record<string, string | null> | null): string[] {
  if (!asm) {
    return [];
  }
  const codes: string[] = [];
  for (const [key, value] of Object.entries(asm)) {
    const match = /^asm_(\d{2})$/.exec(key);
    if (!match || value === null) {
      continue;
    }
    const code = match[1];
    const excellent =
      code === ASTHMA_ASM_CODE ? value === '양호' : value === '1';
    if (excellent) {
      codes.push(code);
    }
  }
  return codes.sort();
}

/**
 * 항목별 적정성평가 등급을 **숫자로**(1=최고 ~ 5). 표시·정렬·범위필터를 이 하나로 한다.
 *
 * 1~5 등급만 담는다 — 천식(16)의 '양호'는 1등급이라 1 로 바꾼다. **'등급제외'·미평가(NULL)는
 * 뺀다**: 등급제외는 성적이 나쁜 게 아니라 사례수 부족 등으로 **등급을 못 매긴 것**이라, 최하로
 * 깔면 부당하다 — 숫자 등급이 아니므로 빼고, 정렬에서는 missing 으로 뒤로 보낸다.
 */
function asmNumericGrades(
  asm: Record<string, string | null> | null,
): Record<string, number> | undefined {
  if (!asm) {
    return undefined;
  }
  const grades: Record<string, number> = {};
  for (const [key, value] of Object.entries(asm)) {
    const match = /^asm_(\d{2})$/.exec(key);
    if (!match || value === null) {
      continue;
    }
    const grade = numericGrade(match[1], value);
    if (grade !== undefined) {
      grades[match[1]] = grade;
    }
  }
  return Object.keys(grades).length ? grades : undefined;
}

/**
 * 표시용 등급 원본(비-NULL 전부, 문자열 그대로). '등급제외'·'양호' 라벨을 화면에 보여주려는 것.
 * 색인 안 하므로(enabled:false) 검색·정렬에는 안 쓴다 — 그건 asm_grades(숫자)가 한다.
 */
function rawAsmGrades(
  asm: Record<string, string | null> | null,
): Record<string, string> | undefined {
  if (!asm) {
    return undefined;
  }
  const grades: Record<string, string> = {};
  for (const [key, value] of Object.entries(asm)) {
    const match = /^asm_(\d{2})$/.exec(key);
    if (match && value !== null) {
      grades[match[1]] = value;
    }
  }
  return Object.keys(grades).length ? grades : undefined;
}

/** 숫자 등급맵 → 등급별 개수(등급→개수). 0인 등급은 담지 않는다. */
function asmGradeCounts(
  grades: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!grades) {
    return undefined;
  }
  const counts: Record<string, number> = {};
  for (const grade of Object.values(grades)) {
    const key = String(grade);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.keys(counts).length ? counts : undefined;
}

/** 등급 문자열 → 1~5 정수. 천식 '양호'=1. 그 외(등급제외·미상)는 undefined(정렬에서 제외). */
function numericGrade(code: string, value: string): number | undefined {
  if (code === ASTHMA_ASM_CODE && value === '양호') {
    return 1;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : undefined;
}

// ── 소도구 ────────────────────────────────────────────────────────────────

function isLang(value: string): value is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function cleanStr(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function numOrUndef(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

/** null 값을 걷어낸 숫자 오브젝트. 전부 null 이면 빈 오브젝트. */
function compact(obj: Record<string, number | null>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function emptyToUndef(map: LangMap): LangMap | undefined {
  return Object.keys(map).length ? map : undefined;
}
