/**
 * refresh 회전을 **탭 하나만** 하도록 묶는다.
 *
 * refresh token 은 1회용이라, 같은 앱을 두 탭에 띄워두고 둘 다 만료된 access token 으로
 * API 를 부르면 양쪽이 같은 refresh 값으로 동시에 `/oauth/token` 을 친다. 먼저 도착한
 * 쪽만 성공하고 나머지는 401 을 받는데, SDK 는 그때 저장소를 비운다 — 쿠키로 회복되는
 * 자사 앱과 달리 **사용자가 다시 로그인해야 한다.** 그래서 직렬화가 필요하다.
 *
 * Web Locks 가 없는 환경(구형 webview, 테스트 러너 등)에서는 그냥 실행한다. 그 경우에도
 * 호출자 쪽 단일 비행은 살아 있어서 한 탭 안에서의 중복은 막힌다.
 */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return fn();
  // 콜백이 promise 를 반환하면 그게 끝날 때까지 락을 쥔다(사양). 다만 lib 타입이 콜백
  // 반환형을 T 로 고정해 Promise<T> 를 그대로 흘리지 못해, 결과만 밖으로 받아낸다.
  let result!: T;
  await locks.request(name, async () => {
    result = await fn();
  });
  return result;
}
