import { API_BASE_URL } from '@/shared/config/env';
import { clearSession, getSession, setSession } from './session';

/** 서버 에러 응답을 담는 에러. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }
}

interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/**
 * 세션을 갱신한다. 실패하면 세션을 비운다.
 *
 * **1st-party 서브도메인 SSO**: `credentials: 'include'` 로 `.plzhans.com` 공유 refresh 쿠키를 보낸다.
 * body 에 refresh token 이 있으면(과거 흐름) 그걸 쓰고, 없으면 **쿠키만으로** 갱신한다 —
 * hans-auth 에서 로그인했으면 콘솔은 리다이렉트 없이 이 호출로 세션을 인지한다(부트스트랩에서 사용).
 */
export async function refreshSession(): Promise<boolean> {
  const s = getSession();
  const res = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(
      s?.refreshToken
        ? { grant_type: 'refresh_token', refresh_token: s.refreshToken }
        : { grant_type: 'refresh_token' },
    ),
  });
  if (!res.ok) {
    await clearSession();
    return false;
  }
  const data = (await res.json()) as TokenPayload;
  await setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    refreshExpiresAt: data.refreshExpiresAt,
  });
  return true;
}

/**
 * 인증 백엔드 호출 래퍼.
 * - opts.auth=true 면 Authorization: Bearer <access> 를 붙이고, 401 시 refresh 후 1회 재시도한다.
 * - JSON 바디는 자동으로 Content-Type 을 세팅한다.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  opts: { auth?: boolean } = {},
): Promise<T> {
  const doFetch = (): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (opts.auth) {
      const s = getSession();
      if (s) headers.set('Authorization', `Bearer ${s.accessToken}`);
    }
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  };

  let res = await doFetch();
  if (res.status === 401 && opts.auth && (await refreshSession())) {
    res = await doFetch();
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
