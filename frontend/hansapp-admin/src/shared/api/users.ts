import { apiFetch } from '@/shared/api/client';

/** 백엔드 UserStatus 와 같은 값. */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN';

/**
 * **null 인 필드는 응답에서 아예 빠진다.** 서버의 StripNullInterceptor 가 값이 없는
 * 프로퍼티를 지우기 때문이다 — 그래서 `?:` 로 선언한다. `x !== null` 로만 검사하면
 * undefined 를 놓친다.
 */
export interface UserSummary {
  id: number;
  email: string;
  name?: string | null;
  status: UserStatus;
  role: string;
  tier: string;
  joinType: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface UserOAuth {
  provider: string;
  email?: string | null;
  connectedAt: string;
}

export interface UserDetail extends UserSummary {
  updatedAt: string;
  withdrawnAt?: string | null;
  /** 이메일 로그인이 가능한 계정인지. **서버는 해시를 내보내지 않는다.** */
  hasPassword: boolean;
  oauths: UserOAuth[];
  activeSessionCount: number;
  appCount: number;
}

/** 백엔드 PageResponseDto 와 같은 모양. */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

export interface UserListParams {
  page: number;
  size: number;
  keyword?: string;
  status?: UserStatus;
}

export function listUsers(params: UserListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  // 빈 문자열을 그대로 보내면 서버가 "빈 키워드로 검색" 으로 받는다. 값이 있을 때만 싣는다.
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.status) query.set('status', params.status);

  return apiFetch<PageResponse<UserSummary>>(`/api/users?${query.toString()}`);
}

export const getUser = (id: number) => apiFetch<UserDetail>(`/api/users/${id}`);
