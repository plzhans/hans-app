import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';

/** 연동 데이터 상세의 API 구간 하나. HIRA·NMC 공통 모양이다. */
export interface MirrorSectionItem {
  fields: { key: string; value: string }[];
  /** 가공하지 않은 원본. "JSON 전체 보기" 가 이걸 그대로 찍는다. */
  raw: unknown;
}

export interface MirrorSection {
  key: string;
  label: string;
  /** 이 오퍼레이션(API)을 조회한 적이 있나. false 면 행 자체가 없다(아직 안 받음). */
  queried: boolean;
  /** queried 인데 내용이 비었다. */
  empty: boolean;
  syncedAt: string | null;
  items: MirrorSectionItem[];
}

/**
 * HIRA·NMC 상세 응답의 공통부. **id 필드는 담지 않는다** — 서버가 ykiho/hpid 로 각기
 * 다른 이름으로 내는데(HiraMirrorDetailDto/NmcMirrorDetailDto), 화면은 어차피 라우트
 * 파라미터(:id)로 이미 그 값을 들고 있어 응답에서 다시 꺼낼 필요가 없다.
 */
export interface MirrorHospitalDetail {
  name: string | null;
  syncedAt: string;
  linkedHealthcareHospitalId: number | null;
  sections: MirrorSection[];
}

/** 연동 데이터 대시보드의 표 한 줄. */
export interface MirrorTableCount {
  key: string;
  /** 표를 묶는 그룹. 예: "병원", "코드". */
  group: string;
  label: string;
  count: number;
  /** "목록 보기" 가 이동할 경로. 없으면 아직 그 테이블만의 목록 화면이 없다. */
  listPath: string | null;
}

// ── HIRA ─────────────────────────────────────────────────────────────────────

export interface HiraMirrorListItem {
  ykiho: string;
  name?: string | null;
  addr?: string | null;
  tel?: string | null;
  sidoNm?: string | null;
  sgguNm?: string | null;
  clCd?: string | null;
  syncedAt: string;
}

export interface HiraMirrorListParams {
  page: number;
  size: number;
  keyword?: string;
  sidoCd?: string;
  sgguCd?: string;
  clCd?: string;
}

export function listHiraMirrorHospitals(params: HiraMirrorListParams) {
  const query = new URLSearchParams({ page: String(params.page), size: String(params.size) });
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.sidoCd) query.set('sidoCd', params.sidoCd);
  if (params.sgguCd) query.set('sgguCd', params.sgguCd);
  if (params.clCd) query.set('clCd', params.clCd);
  return apiFetch<PageResponse<HiraMirrorListItem>>(
    `/api/integrations/hira/hospitals?${query.toString()}`,
  );
}

export const getHiraMirrorHospital = (ykiho: string) =>
  apiFetch<MirrorHospitalDetail>(`/api/integrations/hira/hospitals/${encodeURIComponent(ykiho)}`);

export const getHiraMirrorDashboard = () =>
  apiFetch<MirrorTableCount[]>('/api/integrations/hira/dashboard');

// ── NMC ──────────────────────────────────────────────────────────────────────

export interface NmcMirrorListItem {
  hpid: string;
  name?: string | null;
  addr?: string | null;
  tel?: string | null;
  sidoNm?: string | null;
  sgguNm?: string | null;
  dutyDiv?: string | null;
  syncedAt: string;
}

export interface NmcMirrorListParams {
  page: number;
  size: number;
  keyword?: string;
  sidoNm?: string;
  sgguNm?: string;
  dutyDiv?: string;
}

export function listNmcMirrorHospitals(params: NmcMirrorListParams) {
  const query = new URLSearchParams({ page: String(params.page), size: String(params.size) });
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.sidoNm) query.set('sidoNm', params.sidoNm);
  if (params.sgguNm) query.set('sgguNm', params.sgguNm);
  if (params.dutyDiv) query.set('dutyDiv', params.dutyDiv);
  return apiFetch<PageResponse<NmcMirrorListItem>>(
    `/api/integrations/nmc/hospitals?${query.toString()}`,
  );
}

export const getNmcMirrorHospital = (hpid: string) =>
  apiFetch<MirrorHospitalDetail>(`/api/integrations/nmc/hospitals/${encodeURIComponent(hpid)}`);

export const getNmcMirrorDashboard = () =>
  apiFetch<MirrorTableCount[]>('/api/integrations/nmc/dashboard');
