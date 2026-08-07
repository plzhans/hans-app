import { API_BASE_URL } from '@/shared/config/env';
import {
  clearAccessToken,
  clearSessionHint,
  getAccessToken,
  hasSessionHint,
  setAccessToken,
} from '@/shared/api/session';

/** 서버 에러 응답을 담는 에러. 화면은 errorMessage() 로 사람 말로 바꿔 쓴다. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }
}

interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

/**
 * 갱신 결과.
 *
 * **`offline` 과 `expired` 를 반드시 갈라야 한다.** 둘을 한 값으로 뭉치면 서버가 잠깐
 * 내려간 사이(배포·재시작)에 새로고침한 관리자가 세션이 멀쩡한데도 로그인 화면으로 튕긴다.
 */
export type RefreshResult = 'ok' | 'expired' | 'offline';

/**
 * 세션 갱신. **동시에 여러 요청이 401 을 맞아도 갱신은 한 번만 나간다.**
 *
 * 목록 화면 하나가 여러 요청을 동시에 던지는데 access 가 막 만료됐다면 그 수만큼 갱신이
 * 나간다. refresh 는 rotate 라서, 먼저 도착한 것이 토큰을 바꾸면 뒤따르던 것들은 이미
 * 죽은 토큰으로 요청해 401 을 받고 — 결국 로그인 화면으로 튕긴다. 하나로 합쳐야 한다.
 */
let inflight: Promise<RefreshResult> | null = null;

export function refreshSession(): Promise<RefreshResult> {
  if (inflight) return inflight;

  const run = refreshOnce();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

async function refreshOnce(): Promise<RefreshResult> {
  // 힌트가 없으면 서버에 물어볼 것도 없다.
  if (!hasSessionHint()) {
    clearAccessToken();
    return 'expired';
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      // **credentials 가 없으면 refresh 쿠키가 실리지 않는다.** 로컬은 포트가 달라
      // 교차 오리진이고, 그때 브라우저는 기본으로 쿠키를 빼고 보낸다.
      credentials: 'include',
    });
    if (!res.ok) {
      // 서버가 거절했다 = 세션이 끝났다. 힌트도 같이 치워 다음 부팅에서 헛돌지 않게 한다.
      clearAccessToken();
      clearSessionHint();
      return 'expired';
    }
    const data = (await res.json()) as TokenResponse;
    setAccessToken(data.accessToken);
    return 'ok';
  } catch {
    /*
      **fetch 가 거부된 것이지 서버가 거절한 게 아니다.** 서버가 재시작 중이거나 네트워크가
      끊긴 경우인데, 여기서 힌트를 지우면 세션이 살아 있는데도 로그인부터 다시 해야 한다.
      아무것도 치우지 않고 서버가 돌아오면 다시 시도한다.
    */
    return 'offline';
  }
}

/**
 * API 호출 한 번.
 *
 * 401 을 받으면 갱신을 한 번 시도하고 **딱 한 번만** 재시도한다. 무한히 재시도하면
 * 서버가 계속 401 을 줄 때 그대로 무한 루프가 된다.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  opts: { auth?: boolean } = { auth: true },
): Promise<T> {
  const doFetch = (): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (opts.auth) {
      const token = getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  };

  let res = await doFetch();
  // 갱신에 성공했을 때만 다시 던진다. offline·expired 면 다시 던져도 같은 결과다.
  if (res.status === 401 && opts.auth && (await refreshSession()) === 'ok') {
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

  // **상태 코드가 아니라 본문이 비었는지로 판단한다.** 204 말고도 본문 없는 응답이 있다.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
