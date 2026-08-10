import { apiFetch } from '@/shared/api/client';
import type { AuthLogActionType, PageResponse } from '@/shared/api/users';

/**
 * 전역 인증 기록 한 줄.
 *
 * 회원 상세 탭의 것(`UserAuthLog`)과 같은 표에서 나오지만 두 칸이 더 있다 —
 * 회원번호와 이메일. 거기는 회원이 이미 정해져 있어 필요 없던 값이다.
 */
export interface AuthLog {
  /** BigInt 라 서버가 문자열로 준다. */
  id: string;
  /** 회원이 특정되지 않으면 없다(없는 계정으로의 로그인 시도 등). */
  userId?: number | null;
  /** 로그 표에는 없는 값. 서버가 메인 DB 에서 붙인다. 지워진 회원이면 없다. */
  userEmail?: string | null;
  action: AuthLogActionType;
  result: 'SUCCESS' | 'FAIL';
  provider?: string | null;
  failReason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: unknown;
  createdAt: string;
}

export interface AuthLogParams {
  page: number;
  size: number;
  /** ISO 8601. **필수다** — 서버가 없으면 400 으로 거절한다. */
  from: string;
  to?: string;
  actions?: AuthLogActionType[];
  result?: 'SUCCESS' | 'FAIL';
  ip?: string;
  userId?: number;
  /** 이메일로 찾기. 서버가 회원번호로 바꿔 조회한다. */
  userEmail?: string;
  /** 회원이 특정되지 않은 기록만. */
  anonymousOnly?: boolean;
}

/**
 * 전역 인증 기록. 최근 순.
 *
 * **회원 상세 탭과 무엇이 다른가.** 거기는 회원 한 명의 기록이고, 여기는 대상을 안 가린다 —
 * 특히 `anonymousOnly` 로 보는 행(없는 계정으로의 시도)은 회원 상세에서 영영 안 보인다.
 */
export function listAuthLogs(params: AuthLogParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
    from: params.from,
  });
  if (params.to) query.set('to', params.to);
  if (params.actions?.length) query.set('actions', params.actions.join(','));
  if (params.result) query.set('result', params.result);
  if (params.ip) query.set('ip', params.ip);
  if (params.userId !== undefined) query.set('userId', String(params.userId));
  if (params.userEmail) query.set('userEmail', params.userEmail);
  if (params.anonymousOnly) query.set('anonymousOnly', 'true');

  return apiFetch<PageResponse<AuthLog>>(`/api/logs/auth?${query.toString()}`);
}
