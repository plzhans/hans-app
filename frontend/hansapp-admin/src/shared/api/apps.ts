import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';

/** 백엔드 AppStatus 와 같은 값. */
export type AppStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';
export type AppClientType = 'WEB' | 'IOS' | 'ANDROID';

export interface AppOwner {
  id: number;
  email: string;
  name?: string | null;
}

/**
 * 앱 요약.
 *
 * **null 인 필드는 응답에서 아예 빠진다.** 서버의 StripNullInterceptor 가 값이 없는
 * 프로퍼티를 지우기 때문이다 — 그래서 `?:` 로 선언한다. `x !== null` 로만 검사하면
 * undefined 를 놓친다.
 */
export interface AppSummary {
  id: number;
  name: string;
  status: AppStatus;
  /** 심사 요청 시각. status=PENDING 일 때만 의미가 있다. */
  reviewRequestedAt?: string | null;
  /** 거절 사유. PENDING + 이 값이 있으면 거절된 앱이다. */
  rejectionReason?: string | null;
  /** 삭제 시각. 있으면 소프트 삭제된 앱이다. */
  deletedAt?: string | null;
  owner?: AppOwner | null;
  apiKeyCount: number;
  clientCount: number;
  memberCount: number;
  createdAt: string;
}

export interface AppApiKey {
  id: number;
  name: string;
  /** 표시용 접두사. 서버는 원문도 해시도 내보내지 않는다. */
  keyPrefix: string;
  status: AppStatus;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface AppClient {
  id: number;
  clientId: string;
  name: string;
  type: AppClientType;
  origins: string[];
  redirectUris: string[];
  /** client secret 뒤 4자(마스킹 표기용). 네이티브 클라이언트는 없다. */
  secretSuffix?: string | null;
  /** client secret 발급·재발급 시각. 마지막으로 언제 돌렸는지. */
  secretCreatedAt?: string | null;
  /**
   * 네이티브 플랫폼 식별자. iOS={ bundleId }, Android={ packageName, fingerprints[] }.
   * 웹은 없다. 비밀값이 아니다 — 앱스토어에 공개되는 식별자다.
   */
  config?: Record<string, unknown> | null;
  status: AppStatus;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface AppMember {
  role: string;
  joinedAt: string;
  user?: AppOwner | null;
}

export interface AppDetail extends AppSummary {
  apiKeyLimit: number;
  updatedAt: string;
  members: AppMember[];
  apiKeys: AppApiKey[];
  clients: AppClient[];
}

export interface AppListParams {
  page: number;
  size: number;
  keyword?: string;
  status?: AppStatus;
  includeDeleted?: boolean;
}

export function listApps(params: AppListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.status) query.set('status', params.status);
  if (params.includeDeleted) query.set('includeDeleted', 'true');

  return apiFetch<PageResponse<AppSummary>>(`/api/apps?${query.toString()}`);
}

export const getApp = (id: number) => apiFetch<AppDetail>(`/api/apps/${id}`);

/**
 * 앱 승인. 미승인 상태였던 서비스 키·클라이언트도 함께 켜진다.
 *
 * **응답이 갱신된 상세다.** 승인으로 무엇이 함께 켜졌는지가 그 안에 다 들어 있어서
 * 화면이 다시 물어볼 필요가 없다.
 */
export const approveApp = (id: number) =>
  apiFetch<AppDetail>(`/api/apps/${id}/approve`, { method: 'POST' });

/** 앱 심사 거절. 사유는 소유자에게 그대로 보인다. */
export const rejectApp = (id: number, reason: string) =>
  apiFetch<AppDetail>(`/api/apps/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

/**
 * 앱 차단. 앱과 그에 속한 키·클라이언트가 모두 중지돼 API 호출이 즉시 거부된다.
 * 삭제가 아니라 차단 해제로 되돌릴 수 있다.
 */
export const blockApp = (id: number) =>
  apiFetch<AppDetail>(`/api/apps/${id}/block`, { method: 'POST' });

/** 앱 차단 해제. 중지된 키·클라이언트가 다시 살아난다. */
export const unblockApp = (id: number) =>
  apiFetch<AppDetail>(`/api/apps/${id}/unblock`, { method: 'POST' });
