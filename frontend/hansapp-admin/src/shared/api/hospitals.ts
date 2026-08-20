import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';

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
  tier?: string;
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
  if (params.tier) query.set('tier', params.tier);
  if (params.emergency) query.set('emergency', 'true');
  if (params.baby) query.set('baby', 'true');
  for (const key of CODE_ARRAY_KEYS) {
    const value = params[key];
    if (value?.length) query.set(key, value.join(','));
  }

  return apiFetch<PageResponse<HospitalSummary>>(`/api/healthcare/hospitals?${query.toString()}`);
}
