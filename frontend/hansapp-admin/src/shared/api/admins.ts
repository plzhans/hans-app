import { apiFetch } from '@/shared/api/client';
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
}

export interface AdminAccountDetail extends AdminAccount {
  updatedAt: string;
  /** 살아 있는 로그인 세션 수(만료된 것은 뺀다). */
  activeSessionCount: number;
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

/** 전체 목록. 페이징이 없다 — 계정 수가 적어 나눌 것이 없다. */
export const listAdmins = () => apiFetch<AdminAccount[]>('/api/admins');

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
}

/**
 * 비밀번호를 다시 낸다. **본인이 값을 잃어버렸을 때 다른 관리자가 부르는 경로다.**
 *
 * 이 계정의 살아 있는 세션이 모두 끊기고, 본인이 첫 로그인에서 다시 바꿔야 한다.
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
