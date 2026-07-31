import { API_BASE_URL } from '@/shared/config/env';
import { publishAuth, withRefreshLock } from '@/shared/auth/authChannel';
import {
  clearSession,
  clearSessionHint,
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
 * refresh 는 **httpOnly 쿠키로만** 오간다 — `credentials: 'include'` 로 쿠키를 보낸다(저장소엔 refresh 없음).
 * 응답에서 access token 만 받아 보관한다.
 *
 * **부팅 때 세션 복원에도 쓴다** — 이 오리진에 저장된 토큰이 없어도 공유 refresh 쿠키
 * (`.plzhans.com`)가 살아 있으면 로그인된 사용자다(포털에서 로그인한 뒤 인증웹으로 온 경우).
 * 단, 무조건 부르지 않는다: 로그인 힌트 쿠키(hasSessionHint)가 있을 때만 — 로그아웃
 * 상태에서 매 방문마다 서버를 때리지 않으려고 읽을 수 있는 flag 를 따로 둔 것이다.
 */
export function tryRefresh(): Promise<boolean> {
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

/** 락을 잡은 뒤 실제로 한 번 회전시킨다. */
async function refreshOnce(): Promise<boolean> {
  // 락을 기다리는 동안 다른 탭이 이미 회전시켰을 수 있다. 저장소를 다시 읽어 새 토큰이
  // 들어와 있으면 내 호출은 접는다 — 회전은 1회용이라 뒤늦게 보내봐야 401 이다.
  //
  // **before 가 있을 때만 이 지름길을 탄다.** 없으면 "남이 갱신했다" 가 아니라 "이 탭이 아직
  // 저장소를 안 읽었다" 는 뜻이다. 둘을 섞으면 만료된 토큰을 새 것으로 착각해 갱신을
  // 건너뛰고, 호출자는 401 을 그대로 맞는다(새 페이지 로드 직후가 정확히 그 상황이다).
  const before = getSession()?.accessToken;
  const stored = await hydrateSession();
  if (before && stored && stored.accessToken !== before) return true;

  if (await postRefresh()) return true;
  // 힌트 쿠키가 아직 있으면 세션이 죽은 게 아니라 **경합에서 진 것**일 수 있다
  // (다른 오리진의 탭이 같은 순간에 회전 — Web Locks 로는 못 묶는 구간).
  // 그 사이 Set-Cookie 가 도착했을 테니 딱 한 번만 다시 시도한다.
  if (hasSessionHint() && (await postRefresh())) return true;

  // 서버가 확정적으로 거절했다. 힌트가 남아 있으면 다음 방문에도 세션이 있다고 오판해
  // 앱 사이를 왕복하므로 같이 지운다(로그아웃이 아닌 만료·폐기 경로).
  await clearSession();
  clearSessionHint();
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
  if (res.status === 401 && opts.auth && (await tryRefresh())) {
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
