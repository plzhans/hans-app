import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';
import type { CacheState } from '@/shared/components/CachePanel';

/** 조회 저장소. db=DB(전체 상태, 최소조건) · es=검색색인(활성만, 상세조건). */
export type HospitalEngine = 'db' | 'es';

export interface HospitalSummary {
  id: number;
  name: string;
  legalName: string;
  status: string;
  source: string;
  ykiho?: string | null;
  hpid?: string | null;
  classCd?: string | null;
  regionCd?: string | null;
  tier?: string | null;
  addr?: string | null;
  tel?: string | null;
}

export interface HospitalListParams {
  engine: HospitalEngine;
  page: number;
  size: number;
  keyword?: string;
  status?: string;
  classCd?: string;
  regionCd?: string;
  /** 아래는 [es 전용] — engine='db' 일 때 실으면 서버가 400 을 준다. */
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

const CODE_ARRAY_KEYS = [
  'tier',
  'subjectCds',
  'specialistCds',
  'equipmentCds',
  'specialtyCds',
  'specialCds',
  'asmExcellentCds',
] as const;

export function listHospitals(params: HospitalListParams) {
  const query = new URLSearchParams({
    engine: params.engine,
    page: String(params.page),
    size: String(params.size),
  });
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.status) query.set('status', params.status);
  if (params.classCd) query.set('classCd', params.classCd);
  if (params.regionCd) query.set('regionCd', params.regionCd);
  if (params.emergency) query.set('emergency', 'true');
  if (params.baby) query.set('baby', 'true');
  for (const key of CODE_ARRAY_KEYS) {
    const value = params[key];
    if (value?.length) query.set(key, value.join(','));
  }

  return apiFetch<PageResponse<HospitalSummary>>(`/api/healthcare/hospitals?${query.toString()}`);
}

export interface HospitalSubject {
  cd: string;
  name?: string | null;
  declared: boolean;
  doctorCnt?: number | null;
  specialistCnt?: number | null;
}

export interface HospitalEquipment {
  cd: string;
  name?: string | null;
  cnt?: number | null;
}

export interface HospitalCapability {
  tp: string;
  cd: string;
  name?: string | null;
}

export interface HospitalHours {
  kind: string;
  day: number;
  openTime?: string | null;
  closeTime?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  receptionEnd?: string | null;
}

export interface HospitalStaff {
  doctorTotal?: number | null;
  specialist?: number | null;
  resident?: number | null;
  intern?: number | null;
  generalDoctor?: number | null;
  dentist?: number | null;
  oriental?: number | null;
  midwife?: number | null;
}

export interface HospitalBeds {
  total?: number | null;
  standard?: number | null;
  higher?: number | null;
  icu?: number | null;
  emergency?: number | null;
  operatingRoom?: number | null;
  delivery?: number | null;
  neonatal?: number | null;
  isolation?: number | null;
  psyOpen?: number | null;
  psyClosed?: number | null;
}

export interface HospitalI18n {
  lang: string;
  name?: string | null;
  intro?: string | null;
  notice?: string | null;
  directions?: string | null;
}

export interface HospitalAssessmentItem {
  code: string;
  name: string;
  grade: string;
}

export interface HospitalAssessmentGroup {
  code: string;
  name: string;
  items: HospitalAssessmentItem[];
}

export interface HospitalDetail extends HospitalSummary {
  corpName?: string | null;
  className?: string | null;
  regionName?: string | null;
  emdongNm?: string | null;
  postNo?: string | null;
  lat?: number | null;
  lon?: number | null;
  homepage?: string | null;
  estbDd?: string | null;
  intro?: string | null;
  notice?: string | null;
  directions?: string | null;
  parkQty?: number | null;
  parkPaid?: boolean | null;
  transport?: unknown;
  emergencyYn: boolean;
  babyYn: boolean;
  builtAt: string;
  subjects: HospitalSubject[];
  hours: HospitalHours[];
  staff?: HospitalStaff | null;
  beds?: HospitalBeds | null;
  equipments: HospitalEquipment[];
  capabilities: HospitalCapability[];
  i18n: HospitalI18n[];
  assessment?: HospitalAssessmentGroup[] | null;
}

export const getHospital = (id: number) => apiFetch<HospitalDetail>(`/api/healthcare/hospitals/${id}`);

export interface HospitalMetaOption {
  code: string;
  name: string;
}

export interface HospitalMetaRegion {
  code: string;
  name: string;
  shortName?: string | null;
  /** sido | sggu */
  level: string;
  parentCode?: string | null;
}

/** 검색 필터에 쓰는 코드 이름표. 값이 자주 안 바뀌어 오래 캐시해도 된다(useHospitalMeta 참고). */
export interface HospitalMeta {
  classes: HospitalMetaOption[];
  subjects: HospitalMetaOption[];
  equipments: HospitalMetaOption[];
  specialties: HospitalMetaOption[];
  specials: HospitalMetaOption[];
  assessments: HospitalMetaOption[];
  regions: HospitalMetaRegion[];
}

export const getHospitalMeta = () => apiFetch<HospitalMeta>('/api/healthcare/hospitals/meta');

/**
 * 이 병원의 공개 API 캐시 상태(base). 글·회원 캐시와 같은 모양(CacheState)이라
 * 같은 패널(CachePanel)로 그린다.
 */
export type HospitalCacheState = CacheState;

export const getHospitalCacheState = (id: number) =>
  apiFetch<HospitalCacheState>(`/api/healthcare/hospitals/${id}/cache`);

/** 공개 API 의 base·i18n(전 언어) 캐시를 함께 지운다. */
export const purgeHospitalCache = (id: number) =>
  apiFetch<void>(`/api/healthcare/hospitals/${id}/cache/purge`, { method: 'POST' });
