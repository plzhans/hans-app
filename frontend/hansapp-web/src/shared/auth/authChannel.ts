/**
 * 탭 사이 로그인 상태 전파.
 *
 * 같은 앱을 여러 탭에 띄워두면 한 탭에서 로그인·로그아웃해도 나머지 탭은 모른다. 저장소를
 * 공유하니 새로고침하면 맞춰지지만, 그전까지는 로그아웃한 탭 옆에서 로그인 화면이 떠 있거나
 * 그 반대가 된다. 상태가 바뀐 탭이 알려주면 나머지가 즉시 따라온다.
 *
 * **같은 오리진끼리만 닿는다**(BroadcastChannel 제약). 인증웹과 포털은 서로 다른 오리진이라
 * 이걸로 못 묶는다 — 그쪽은 공유 refresh 쿠키와 힌트 쿠키가 담당하고, 탭이 다음에 부팅할 때
 * 반영된다. 여기서 해결하려는 건 **한 앱의 여러 탭**이다.
 */
export type AuthEvent =
  /** 로그인 성립. 다른 탭은 저장소에서 새 세션을 집어 인증 상태로 전환한다. */
  | 'login'
  /** 명시적 로그아웃. 서버 세션이 폐기됐으므로 다른 탭도 즉시 익명으로. */
  | 'logout'
  /** refresh 회전 성공. access token 만 바뀌었다(로그인 상태는 그대로). */
  | 'refreshed';

const CHANNEL = 'plzhans.auth';

// 지원하지 않는 환경(구형 webview 등)이면 null — 전파만 안 될 뿐 각 탭은 정상 동작한다.
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

/** 보낸 탭에는 오지 않는다(BroadcastChannel 사양) — 자기 이벤트를 되받는 걱정은 없다. */
export function publishAuth(event: AuthEvent): void {
  channel?.postMessage(event);
}

/** 구독. 반환값을 호출하면 해제한다(useEffect cleanup 용). */
export function subscribeAuth(handler: (event: AuthEvent) => void): () => void {
  if (!channel) return () => {};
  const listener = (e: MessageEvent<AuthEvent>) => handler(e.data);
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

/**
 * refresh 회전을 **탭 하나만** 하도록 묶는다.
 *
 * refresh token 은 1회용이라, 두 탭이 같은 쿠키 값으로 동시에 `/oauth/token` 을 부르면
 * 먼저 도착한 쪽만 성공하고 나머지는 secret 불일치로 401 을 받는다. 세션은 멀쩡한데
 * 진 탭만 로그아웃된 것처럼 보인다. 락으로 직렬화하면 뒤에 온 탭은 앞 탭이 저장해둔
 * 새 토큰을 그대로 쓴다(refreshOnce 의 저장소 재확인).
 *
 * Web Locks 도 같은 오리진 한정이다. 인증웹 탭과 포털 탭이 같은 순간에 회전하는 경합은
 * 남지만 그건 밀리초 창이고, 진 쪽은 힌트 쿠키를 보고 한 번 재시도해서 회복한다.
 */
export async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return fn();
  // 콜백이 promise 를 반환하면 그게 끝날 때까지 락을 쥔다(사양). 다만 lib 타입이 콜백
  // 반환형을 T 로 고정해 Promise<T> 를 그대로 흘리지 못해, 결과만 밖으로 받아낸다.
  let result!: T;
  await navigator.locks.request(`${CHANNEL}.refresh`, async () => {
    result = await fn();
  });
  return result;
}
