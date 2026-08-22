/**
 * 연동 데이터(HIRA·NMC 미러) 상세 화면의 공통 모양.
 *
 * **"조회를 안 한 건지, 조회했는데 없는 건지" 를 가리는 게 이 타입의 존재 이유다.**
 * queried=false 는 그 오퍼레이션(API)을 아직 한 번도 안 불렀다는 뜻이고(행 자체가 없다),
 * queried=true·empty=true 는 불렀는데 내용이 비어 왔다는 뜻이다 — 둘을 합치면 "왜 비어
 * 보이지" 를 캐시 문제인지 원본이 원래 없는 건지 헷갈리게 된다.
 *
 * 필드는 **일부러 손으로 다듬지 않는다.** HIRA 만 11개 오퍼레이션, NMC 까지 합치면 API 마다
 * 수십~수백 개 원본 필드가 있어 전부 번역·정리하려면 끝이 없다 — 그래서 원본 JSON 객체를
 * 1단(top-level)만 펼쳐 key/value 로 보여주고, 화면에는 원본 그대로(JSON)도 나란히 낸다.
 */
export interface MirrorSectionItem {
  /** 이 행의 원본 객체를 1단만 펼친 것. 중첩 객체·배열은 문자열(JSON)로 남는다. */
  fields: { key: string; value: string }[];
  /** 가공하지 않은 원본. 화면의 "JSON 전체 보기" 가 이걸 그대로 찍는다. */
  raw: unknown;
}

/**
 * 연동 데이터 대시보드의 표 한 줄. **HIRA·NMC 미러의 테이블(또는 op 로 쪼개진 논리 테이블)
 * 하나당 한 줄이다** — 상세 화면의 섹션과 같은 key·label 을 쓴다(HiraMirrorDetailService
 * 의 순서와 라벨을 그대로 재사용한다).
 */
export interface MirrorTableCount {
  key: string;
  /** 대시보드를 병원 미러/코드 마스터로 나눠 보여주는 묶음. 예: '병원' | '코드'. */
  group: string;
  label: string;
  count: number;
  /** "목록 보기" 가 이동할 경로. 없으면 아직 그 테이블만의 목록 화면이 없다 — 개수만 보여준다. */
  listPath?: string;
}

export interface MirrorSection {
  key: string;
  label: string;
  /** false 면 이 오퍼레이션을 아직 안 불렀다(행 자체가 없다) — 목록이 비어 보이는 이유를 가른다. */
  queried: boolean;
  /** queried 인데 내용이 비었다(빈 배열·빈 객체 등). */
  empty: boolean;
  syncedAt: string | null;
  /** 단일 섹션은 보통 0~1개, 목록형(진료과목·장비 등)은 여러 개. */
  items: MirrorSectionItem[];
}

/**
 * 원본 payload(HiraHospitalDetail.data 등) → 화면에 그릴 항목 목록.
 *
 * **배열이면 원소마다 항목을 하나씩 낸다.** HIRA 상세 오퍼레이션(11종)은 "1행짜리(info,
 * facility)는 객체, 여러 행짜리(장비·특수진료·진료과목 …)는 배열" 이라고 스키마 주석이
 * 명시한다 — 배열을 flattenFields 에 그대로 넣으면 원소 하나하나가 `[0]`, `[1]` 같은 key 에
 * JSON 문자열 통째로 뭉개져 들어가 "필드가 안 보인다" 는 문제가 생긴다(장비정보가 그 예).
 * 배열 원소마다 항목을 나눠야 각 장비가 자기 필드(코드·이름·수량 등)로 펼쳐진다.
 */
export function toSectionItems(
  value: unknown,
  omitKeys: readonly string[] = [],
): MirrorSectionItem[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((entry) => ({
      fields: flattenFields(entry, omitKeys),
      raw: entry,
    }));
  }
  return [{ fields: flattenFields(value, omitKeys), raw: value }];
}

/**
 * JS 값을 1단만 펼친 필드 목록으로. 원본 API 필드명을 그대로 key 로 쓴다 — 번역하지 않는다
 * (MirrorSection 주석 참고). 중첩 객체·배열은 JSON 문자열로 접어 한 줄에 담는다.
 *
 * **omitKeys 는 "필드" 보기에만 적용된다.** 상세 화면 최상위에 이미 나온 식별자(ykiho/hpid)를
 * 섹션마다 또 보여주면 중복이라 — 부르는 쪽(HiraMirrorDetailService 등)이 `['ykiho']` 를
 * 넘겨 뺀다. `raw`(JSON 전체 보기)는 이 필터를 안 거친 원본 그대로다 — 원본을 그대로 보여줘야
 * 하는 자리라서다(toSectionItems 참고).
 */
export function flattenFields(
  value: unknown,
  omitKeys: readonly string[] = [],
): { key: string; value: string }[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value !== 'object') {
    return [{ key: 'value', value: stringifyValue(value) }];
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => ({ key: `[${index}]`, value: stringifyValue(item) }));
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !omitKeys.includes(key))
    .map(([key, v]) => ({ key, value: stringifyValue(v) }));
}

/** 원시값만 String() 으로 옮긴다 — 객체는 "[object Object]" 로 뭉개지므로 JSON.stringify 로 보낸다. */
function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** 값이 "내용이 비었다" 고 볼 수 있는가. 빈 배열·빈 객체·빈 문자열·null 이 여기 해당한다. */
export function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}
