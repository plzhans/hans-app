import { apiFetch } from '@/shared/api/client';
import type { CacheState } from '@/shared/components/CachePanel';

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

/**
 * 회원 정보 수정. **보낸 항목만 바뀐다.**
 *
 * 지금 고칠 수 있는 것은 표시 이름뿐이다 — 이메일은 로그인 식별자이고, 이메일 인증 여부는
 * "우리가 확인했다" 는 기록이며, 등급은 앱 생성 한도를 바꾸는 값이라 서버가 열지 않았다.
 */
export const updateUser = (id: number, input: { name?: string }) =>
  apiFetch<void>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

/** 로그인해 둔 기기 한 줄. */
export interface UserSession {
  /** 이 기기를 끊을 때 쓴다. 이 값만으로는 로그인할 수 없다(secret 은 해시로만 저장된다). */
  sessionId: string;
  userAgent?: string | null;
  ip?: string | null;
  /** "로그인 상태 유지" 를 켜고 만든 세션인지. */
  persistent: boolean;
  createdAt: string;
  /** 마지막 갱신 시각. 사실상 최근 활동 시각이다. */
  updatedAt: string;
  expiresAt: string;
}

/**
 * `/users/me` 응답 캐시의 상태.
 *
 * **글 캐시(PostCacheState)와 같은 모양이다** — 콘솔이 같은 패널(CachePanel)로 보여 준다.
 */
export type ProfileCacheState = CacheState;

export const getUserCacheState = (id: number) =>
  apiFetch<ProfileCacheState>(`/api/users/${id}/cache`);

/** Redis 를 지우고, 각 API 인스턴스가 자기 메모리 캐시를 비우도록 알린다. */
export const purgeUserCache = (id: number) =>
  apiFetch<void>(`/api/users/${id}/cache/purge`, { method: 'POST' });

/** 회원 한 명이 로그인해 둔 기기들. 살아 있는 것만, 최근 활동 순. 페이지가 없다. */
export const listUserSessions = (id: number) =>
  apiFetch<UserSession[]>(`/api/users/${id}/sessions`);

/**
 * 기기 한 대를 끊는다.
 *
 * **바로 막히지는 않는다.** 서버가 세션 캐시를 갱신하기까지(기본 60초) 이미 발급된
 * access token 은 통한다 — 화면 문구도 그렇게 적어야 한다.
 */
export const revokeUserSession = (id: number, sessionId: string) =>
  apiFetch<void>(`/api/users/${id}/sessions/${sessionId}`, {
    method: 'DELETE',
  });

/** 이 회원의 모든 기기를 끊는다. 반영 시점은 개별 끊기와 같다. */
export const revokeAllUserSessions = (id: number) =>
  apiFetch<void>(`/api/users/${id}/sessions`, { method: 'DELETE' });

/**
 * 인증 기록의 이벤트 종류. 백엔드 AuthLogAction 과 같은 값이다.
 *
 * **로그인만 있는 게 아니다** — 문의 대응에서 실제로 묻는 것("비밀번호 언제 바꿨죠?",
 * "소셜 연동 언제 풀렸어요?")이 로그인 밖에 있는 경우가 많다.
 *
 * 반대로 서비스 행위(좋아요·조회)는 **여기 없다.** 그건 별도 표로 간다.
 */
export type AuthLogActionType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'SIGNUP'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'EMAIL_VERIFY'
  | 'OAUTH_LINK'
  | 'OAUTH_UNLINK'
  | 'WITHDRAW';

export interface UserAuthLog {
  /** BigInt 라 서버가 문자열로 준다. */
  id: string;
  action: AuthLogActionType;
  result: 'SUCCESS' | 'FAIL';
  provider?: string | null;
  failReason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * 액션별 부가정보. **모양이 액션마다 달라 타입을 두지 않는다** —
   * 화면은 해석하지 않고 펼쳐서 그대로 보여 준다.
   */
  detail?: unknown;
  createdAt: string;
}

export interface UserAuthLogParams {
  page: number;
  size: number;
  /** ISO 8601. 없으면 처음부터. */
  from?: string;
  /** ISO 8601. 없으면 지금까지. */
  to?: string;
  /** 비어 있으면 전체 액션. */
  actions?: AuthLogActionType[];
}

/** 회원 한 명의 인증·계정 기록. 최근 순. */
export function listUserAuthLogs(id: number, params: UserAuthLogParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  // 쉼표로 묶어 보낸다 — 같은 키를 반복하는 것보다 URL 이 짧고 서버도 둘 다 받는다.
  if (params.actions?.length) query.set('actions', params.actions.join(','));

  return apiFetch<PageResponse<UserAuthLog>>(
    `/api/users/${id}/auth-logs?${query.toString()}`,
  );
}
