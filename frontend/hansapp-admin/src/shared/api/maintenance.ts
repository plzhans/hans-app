import { apiFetch } from '@/shared/api/client';

/** 지울 수 있는 캐시 갈래. **패턴은 서버가 고른다** — 화면은 이름만 보낸다. */
export type CacheTarget =
  | 'board'
  | 'userProfile'
  /** 관리자의 내 정보(`/api/admins/me`) 응답. */
  | 'adminProfile'
  /** 관리자의 인증 캐시. **로그아웃이 아니다** — 살아 있는 세션은 DB 를 다시 읽고 통과한다. */
  | 'adminSession';

/** 한 갈래의 규모. */
export interface CacheCount {
  count: number;
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

/**
 * 이 갈래가 몇 건인지 센다.
 *
 * **화면을 열 때 부르지 않는다.** 세는 비용이 매칭된 키가 아니라 Redis 에 있는 모든 키에
 * 비례해서(SCAN), 들어가기만 해도 전체를 갈래마다 훑게 된다. 지울지 정하는 그 순간에만 부른다.
 */
export const countCache = (target: CacheTarget) =>
  apiFetch<CacheCount>(`/api/maintenance/cache/${target}/count`);

/** 살아 있는 세션 수. 이쪽은 DB 한 번이라 싸지만, 부르는 시점은 캐시와 같게 맞춘다. */
export const countSessions = () =>
  apiFetch<{ count: number }>('/api/maintenance/sessions/count');

/** 관리자 세션 수. */
export const countAdminSessions = () =>
  apiFetch<{ count: number }>('/api/maintenance/admin-sessions/count');

export const purgeCache = (target: CacheTarget) =>
  apiFetch<CachePurgeResult>(`/api/maintenance/cache/${target}/purge`, {
    method: 'POST',
  });

/** 모든 회원 로그아웃. 전원이 다시 로그인해야 한다. */
export const purgeAllSessions = () =>
  apiFetch<SessionPurgeResult>('/api/maintenance/sessions/purge', {
    method: 'POST',
  });

export interface AdminSessionPurgeResult {
  sessions: number;
  admins: number;
  cacheLeft: number;
}

/**
 * 모든 관리자 로그아웃.
 *
 * **부른 사람도 함께 나간다.** 관리자 세션에 예외를 두지 않는다 — 부르고 나면 이 콘솔은
 * 곧바로 로그인 화면으로 떨어진다.
 */
export const purgeAllAdminSessions = () =>
  apiFetch<AdminSessionPurgeResult>('/api/maintenance/admin-sessions/purge', {
    method: 'POST',
  });
