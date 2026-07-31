import { API_BASE_URL } from '@/shared/config/env';
import { publishAuth, withRefreshLock } from '@/shared/auth/authChannel';
import {
  clearSession,
  getSession,
  hasSessionHint,
  hydrateSession,
  setSession,
} from './session';

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
}

/**
 * 세션을 갱신한다. 실패하면 세션을 비운다.
 *
 * refresh token 은 **httpOnly 쿠키로만** 오간다 — `credentials: 'include'` 로 `.plzhans.com`(또는
 * 로컬 host-only) 공유 refresh 쿠키를 보낸다. 저장소엔 refresh 를 두지 않으므로 body 에도 안 싣는다
 * (XSS 로도 refresh 를 못 읽게). hans-auth 에서 로그인했으면 콘솔은 리다이렉트 없이 이 호출로 세션을 인지한다.
 * 응답에서 access token 만 받아 보관한다.
 */
export function refreshSession(): Promise<boolean> {
  // 같은 탭에서 여러 요청이 동시에 401 을 맞으면 회전 호출도 그만큼 나간다. 하나로 합친다.
  if (inflight) return inflight;
  const run = withRefreshLock(refreshOnce);
  inflight = run;
  void run
    .catch(() => false)
    .finally(() => {
      if (inflight === run) inflight = null;
    });
  return run;
}

/** 이 탭에서 진행 중인 회전. 뒤따르는 호출은 결과에 편승한다. */
let inflight: Promise<boolean> | null = null;

/**
 * 락을 잡은 뒤 실제로 한 번 회전시킨다.
 *
 * refresh 는 1회용이라 두 탭이 같은 쿠키 값으로 동시에 부르면 뒤에 도착한 쪽이 401 을 받는다.
 * 세션은 멀쩡한데 그 탭만 로그아웃된 것처럼 보인다 — 그래서 직렬화가 필요하다.
 */
async function refreshOnce(): Promise<boolean> {
  // 락을 기다리는 동안 다른 탭이 이미 회전시켰을 수 있다. 저장소를 다시 읽어 새 토큰이
  // 들어와 있으면 내 호출은 접는다 — 뒤늦게 보내봐야 401 이다.
  const stale = getSession()?.accessToken;
  const stored = await hydrateSession();
  if (stored && stored.accessToken !== stale) return true;

  if (await postRefresh()) return true;
  // 힌트 쿠키가 아직 있으면 세션이 죽은 게 아니라 **경합에서 진 것**일 수 있다
  // (인증웹 탭과 동시 회전 — Web Locks 는 같은 오리진만 묶어서 그 구간은 못 막는다).
  // 그 사이 Set-Cookie 가 도착했을 테니 딱 한 번만 다시 시도한다.
  if (hasSessionHint() && (await postRefresh())) return true;

  await clearSession();
  return false;
}

async function postRefresh(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ grant_type: 'refresh_token' }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as TokenPayload;
  await setSession({ accessToken: data.accessToken });
  // 다른 탭이 낡은 access token 을 들고 401 을 맞지 않게 알린다.
  publishAuth('refreshed');
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
