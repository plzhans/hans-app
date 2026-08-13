import { apiFetch } from '@/shared/api/client';
import type { CacheState } from '@/shared/components/CachePanel';
// 페이지 응답의 모양은 화면을 가리지 않는다 — 회원 쪽에서 정의한 것을 그대로 쓴다.
import type { PageResponse } from '@/shared/api/users';

/** 백엔드 AdminStatus 와 같은 값. DISABLED 는 로그인이 막힌 계정이다. */
export type AdminStatus = 'ACTIVE' | 'DISABLED';

/**
 * 관리자 등급. 백엔드 AdminRole 과 같은 값이고 **위에서부터 높은 순**이다.
 *
 * 이 값이 정하는 것은 관리자 계정을 다루는 권한뿐이다 — 자기보다 높은 등급의 계정은
 * 만들지도 고치지도 못한다(삭제·비밀번호 초기화도 같다). 다른 화면은 아직 등급을 보지 않는다.
 */
export type AdminRole = 'SYSTEM' | 'ADMIN' | 'OPERATOR';

/**
 * 관리자 계정 한 줄.
 *
 * **null 인 필드는 응답에서 아예 빠진다**(StripNullInterceptor). 그래서 `?:` 로 선언한다.
 * 비밀번호는 어떤 모양으로도 오지 않는다 — 서버가 해시만 갖고 있고 그것도 안 내보낸다.
 */
export interface AdminAccount {
  id: number;
  email: string;
  name?: string | null;
  role: AdminRole;
  status: AdminStatus;
  /** 남이 정해 준 비밀번호를 아직 안 바꾼 계정. 이 상태에서는 다른 API 가 막힌다. */
  mustChangePassword: boolean;
  language: string;
  timeZone: string;
  lastLoginAt?: string | null;
  createdAt: string;
  /**
   * 지운 시각. **없으면 살아 있다.**
   *
   * 지운 계정도 행으로 남는다(소프트 삭제) — 로그인은 못 하고, 고칠 수도 없다.
   */
  deletedAt?: string | null;
}

/**
 * 붙어 있는 소셜 하나.
 *
 * **연동되지 않은 provider 는 오지 않는다.** 무엇을 붙일 수 있는지는 화면이 알고 있어야
 * 하고(SOCIAL_PROVIDERS), 이 목록은 실제로 붙어 있는 것만 담는다.
 */
export interface AdminOAuth {
  /** 백엔드 OAuthProvider 와 같은 값(`GOOGLE`). */
  provider: string;
  /** 연동 시점에 provider 가 준 이메일. 관리자 계정의 이메일과 다를 수 있다. */
  email?: string | null;
  connectedAt: string;
}

export interface AdminAccountDetail extends AdminAccount {
  updatedAt: string;
  /** 살아 있는 로그인 세션 수(만료된 것은 뺀다). */
  activeSessionCount: number;
  /** 붙어 있는 소셜 연동. **비어 있는 것이 정상이다.** */
  oauths: AdminOAuth[];
}

export interface AdminCreateInput {
  email: string;
  name?: string;
  /** 자기보다 높은 등급은 서버가 거절한다(403). */
  role: AdminRole;
  /** 10자 이상. 본인이 첫 로그인에서 다시 바꾼다. */
  password: string;
  /** 만든 계정에 이메일·임시 비밀번호를 메일로 알린다. */
  sendEmail?: boolean;
}

/** 메일을 보내려 했는데 못 보낸 이유. */
export type AdminMailFailReason = 'MAIL_DISABLED' | 'SEND_FAILED';

export interface AdminCreated {
  account: AdminAccount;
  /** 안내 메일이 실제로 나갔는가. 보내달라고 하지 않았으면 false 다. */
  emailSent: boolean;
  emailFailReason?: AdminMailFailReason | null;
}

/**
 * 목록. 페이징이 없다 — 계정 수가 적어 나눌 것이 없다.
 *
 * **두 목록이 섞이지 않는다.** 기본은 살아 있는 계정만이고, `deleted` 를 켜면 지운 계정만
 * 온다(지운 시각 최근 순).
 */
export const listAdmins = (deleted = false) =>
  apiFetch<AdminAccount[]>(`/api/admins${deleted ? '?deleted=true' : ''}`);

export const getAdmin = (id: number) =>
  apiFetch<AdminAccountDetail>(`/api/admins/${id}`);

export const createAdmin = (input: AdminCreateInput) =>
  apiFetch<AdminCreated>('/api/admins', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export interface AdminUpdateInput {
  /** 로그인 식별자. **바꾸면 옛 주소로는 로그인할 수 없다.** */
  email?: string;
  /** 자기보다 높은 등급으로는 못 바꾼다(403). */
  role?: AdminRole;
  /** 빈 문자열로 보내면 이름을 지운다. */
  name?: string;
  /** 관리 화면·메일 언어. 지원하지 않는 값이면 400. */
  language?: string;
  /** IANA 타임존 ID. 알아볼 수 없는 값이면 400. */
  timeZone?: string;
}

/** 보낸 항목만 바뀐다. 응답이 갱신된 상세다. */
export const updateAdmin = (id: number, input: AdminUpdateInput) =>
  apiFetch<AdminAccountDetail>(`/api/admins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export interface AdminPasswordResetInput {
  password: string;
  /** 새 비밀번호를 본인에게 메일로 알린다. */
  sendEmail?: boolean;
  /** 살아 있는 세션을 함께 끊는다. **안 주면 끊는다.** */
  revokeSessions?: boolean;
  /** 첫 로그인에서 비밀번호를 다시 바꾸게 만든다. **안 주면 강제한다.** */
  mustChangePassword?: boolean;
}

/**
 * 비밀번호를 다시 낸다. **본인이 값을 잃어버렸을 때 다른 관리자가 부르는 경로다.**
 *
 * 기본은 **첫 로그인에서 변경을 강제하고 살아 있는 세션도 끊는** 것이고, 둘 다 끌 수 있다.
 * 자기 자신에게는 쓸 수 없다(서버가 막는다) — 본인 것은 비밀번호 변경 화면으로 바꾼다.
 */
export const resetAdminPassword = (
  id: number,
  input: AdminPasswordResetInput,
) =>
  apiFetch<{
    emailSent: boolean;
    emailFailReason?: AdminMailFailReason | null;
  }>(`/api/admins/${id}/password`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

/** 계정과 그 세션을 지운다. 자기 자신과 마지막 계정은 서버가 막는다. */
export const deleteAdmin = (id: number) =>
  apiFetch<void>(`/api/admins/${id}`, { method: 'DELETE' });

/**
 * 세션 하나의 인증 캐시. **목록에 실리는 요약이다.**
 *
 * 가드가 요청마다 보는 자리라 실제 통과 여부를 정한다. 기기 목록 자체는 DB 를 보고
 * 그리므로 둘이 어긋날 수 있다 — "끊었는데 왜 아직 되지" 가 그 어긋남이다.
 */
export interface AdminSessionCache {
  hit: boolean;
  /** 남은 시간(ms). 만료 시각을 모르면 없다. */
  remainingMs?: number | null;
}

/** 관리자가 로그인해 둔 기기 한 줄. */
export interface AdminSession {
  /**
   * 이 기기를 끊을 때 쓴다(난수). **계정 안에서만 유일하다** — 관리자번호와 짝으로만
   * 의미가 있고, 이 값만으로는 로그인할 수 없다.
   */
  sessionId: number;
  /** 지금 이 콘솔이 쓰고 있는 세션인가. 본인 계정을 볼 때만 true 가 될 수 있다. */
  current: boolean;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  /** 마지막 갱신 시각. 사실상 최근 활동 시각이다. */
  updatedAt: string;
  expiresAt: string;
  cache: AdminSessionCache;
}

/**
 * 이 관리자의 `GET /api/admins/me` 응답 캐시 상태.
 *
 * **세션 캐시와 다른 것이다.** 그쪽은 가드가 요청마다 보는 판단이라 기기 목록에 붙어 있고,
 * 이쪽은 화면에 뿌리는 값이라 틀리면 옛 값이 보인다(회원 상세의 캐시 탭과 같은 자리).
 */
export const getAdminCache = (id: number) =>
  apiFetch<CacheState>(`/api/admins/${id}/cache`);

/** 내 정보 캐시를 비운다. 값이 바뀔 때 서버가 이미 지우므로 평소에는 누를 일이 없다. */
export const purgeAdminCache = (id: number) =>
  apiFetch<void>(`/api/admins/${id}/cache/purge`, { method: 'POST' });

/**
 * DB 에는 없는데 캐시에만 남아 있는 세션. **잘못된 데이터다.**
 *
 * 기기를 끊을 때 캐시 삭제가 실패하면 생긴다 — 가드는 이 캐시를 보고 통과시키므로,
 * 끊은 기기가 캐시 만료까지 계속 통한다.
 */
export interface OrphanAdminSessionCache {
  sessionId: number;
  /** 캐시에 담긴 만료 시각. 이때까지 통과한다. */
  expiresAt: string;
}

/**
 * 관리자 한 명의 로그인 기기.
 *
 * **DB 와 캐시를 따로 읽어 합친 결과다.** 목록의 정본은 DB 지만 요청을 실제로 통과시키는
 * 것은 캐시라, 어긋나는 쪽(`orphans`)을 감추면 원인을 짚을 수 없다.
 */
export interface AdminSessionList {
  sessions: AdminSession[];
  orphans: OrphanAdminSessionCache[];
}

/** 살아 있는 세션만. 최근 활동 순. 고아 캐시는 따로 온다. */
export const listAdminSessions = (id: number) =>
  apiFetch<AdminSessionList>(`/api/admins/${id}/sessions`);

/**
 * 기기 한 대를 끊는다. **캐시도 함께 비우므로 곧바로 막힌다.**
 *
 * 자기 자신에게도 쓸 수 있다 — 지금 쓰는 세션을 끊으면 그 자리에서 로그인 화면으로 나간다.
 */
export const revokeAdminSession = (id: number, sessionId: number) =>
  apiFetch<void>(`/api/admins/${id}/sessions/${sessionId}`, { method: 'DELETE' });

/** 이 관리자의 모든 기기를 끊는다. */
export const revokeAllAdminSessions = (id: number) =>
  apiFetch<void>(`/api/admins/${id}/sessions`, { method: 'DELETE' });

/** 이 세션의 인증 캐시에 담긴 값. 고아 캐시(DB 행 없음)도 조회된다. */
export const getAdminSessionCacheState = (id: number, sessionId: number) =>
  apiFetch<CacheState>(`/api/admins/${id}/sessions/${sessionId}/cache`);

/**
 * 이 세션의 인증 캐시만 지운다. **세션을 끊는 것이 아니다** — 다음 요청이 DB 를 다시
 * 읽을 뿐이라, 살아 있는 세션이면 그대로 통과한다.
 */
export const purgeAdminSessionCache = (id: number, sessionId: number) =>
  apiFetch<void>(`/api/admins/${id}/sessions/${sessionId}/cache/purge`, {
    method: 'POST',
  });

/**
 * 관리자 기록의 종류. 백엔드 AdminLogAction 과 같은 값이다.
 *
 * **로그인만 있는 게 아니다** — 관리자는 남의 계정을 만들고 지우고 비밀번호를 다시 내는데,
 * 되짚을 때 실제로 묻는 것("누가 이 계정을 지웠나")이 로그인 밖에 있다.
 */
export type AdminLogActionType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'ADMIN_CREATE'
  | 'ADMIN_UPDATE'
  | 'ADMIN_DELETE'
  | 'ADMIN_PASSWORD_RESET'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET';

export interface AdminActionLog {
  /** BigInt 라 서버가 문자열로 준다. */
  id: string;
  action: AdminLogActionType;
  result: 'SUCCESS' | 'FAIL';
  /** 이 일을 한 관리자. 없는 계정으로의 로그인 시도면 없다. */
  adminId?: number | null;
  /** 그때의 이메일. **계정이 지워진 뒤에는 이 값만 남는다.** */
  email?: string | null;
  /** 조치를 당한 관리자. 계정 관리에서만 있다. */
  targetAdminId?: number | null;
  failReason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** 종류마다 모양이 달라 타입을 두지 않는다 — 화면은 펼쳐서 그대로 보여 준다. */
  detail?: unknown;
  createdAt: string;
}

export interface AdminActionLogParams {
  page: number;
  size: number;
  /** ISO 8601. 없으면 처음부터. */
  from?: string;
  /** ISO 8601. 없으면 지금까지. */
  to?: string;
  /** 비어 있으면 전체 종류. */
  actions?: AdminLogActionType[];
}

/**
 * 관리자 한 명의 기록. 최근 순.
 *
 * **이 사람이 한 일과 당한 일을 함께 준다** — 회원 기록에는 없는 방향이다.
 */
export function listAdminActionLogs(id: number, params: AdminActionLogParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  // 쉼표로 묶어 보낸다 — 같은 키를 반복하는 것보다 URL 이 짧고 서버도 둘 다 받는다.
  if (params.actions?.length) query.set('actions', params.actions.join(','));

  return apiFetch<PageResponse<AdminActionLog>>(
    `/api/admins/${id}/action-logs?${query.toString()}`,
  );
}
