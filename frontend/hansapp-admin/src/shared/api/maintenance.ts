import { apiFetch } from '@/shared/api/client';

/** 지울 수 있는 캐시 갈래. **패턴은 서버가 고른다** — 화면은 이름만 보낸다. */
export type CacheTarget = 'board' | 'userProfile';

/** 정리 대상 규모. 누르기 전에 무엇을 얼마나 지우는지 보여 준다. */
export interface MaintenanceSummary {
  board: number;
  userProfile: number;
  sessions: number;
  /** 캐시 저장소가 붙어 있나. false 면 0 은 "없다" 가 아니라 "볼 수 없다" 다. */
  connected: boolean;
}

export interface CachePurgeResult {
  removed: number;
  connected: boolean;
}

export interface SessionPurgeResult {
  sessions: number;
  users: number;
  /** 지우지 못한 캐시 수. 0 이 아니면 그만큼은 만료까지 통과할 수 있다. */
  cacheLeft: number;
}

export const getMaintenanceSummary = () =>
  apiFetch<MaintenanceSummary>('/api/maintenance/summary');

export const purgeCache = (target: CacheTarget) =>
  apiFetch<CachePurgeResult>(`/api/maintenance/cache/${target}/purge`, {
    method: 'POST',
  });

/** 모든 회원 로그아웃. 전원이 다시 로그인해야 한다. */
export const purgeAllSessions = () =>
  apiFetch<SessionPurgeResult>('/api/maintenance/sessions/purge', {
    method: 'POST',
  });
