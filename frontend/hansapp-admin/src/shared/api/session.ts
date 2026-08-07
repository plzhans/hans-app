import { SESSION_HINT_COOKIE } from '@/shared/config/env';

/**
 * access token 보관.
 *
 * **메모리에만 둔다 — localStorage 를 쓰지 않는다.**
 *
 * 공개 콘솔(hansapp-web)은 localStorage 를 쓰는데, 그쪽은 access TTL 이 1시간이라
 * 새로고침마다 갱신 왕복을 하면 손해가 크다. 관리자는 TTL 이 5분이라 어차피 자주 갱신하고,
 * 대신 XSS 로 토큰이 통째로 빠져나갈 자리를 아예 만들지 않는 쪽을 택했다.
 *
 * 새로고침하면 사라지는 것이 정상이다 — 힌트 쿠키를 보고 refresh 로 다시 세운다.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * 힌트 쿠키가 있는가. **이게 있을 때만 refresh 를 호출한다.**
 *
 * 값은 `1` 하나뿐이고 아무 권한도 없다 — "갱신을 시도해 볼 만하다" 는 신호일 뿐이라
 * 신뢰하지 않는다. 실제 판정은 서버가 refresh 쿠키를 보고 한다.
 *
 * 이게 없으면 갱신을 아예 시도하지 않는다. 로그인한 적 없는 방문자마다 401 을 한 번씩
 * 받아내는 것을 피하려는 것이다.
 */
export function hasSessionHint(): boolean {
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${SESSION_HINT_COOKIE}=`));
}

/**
 * 힌트 쿠키를 지운다. 서버가 갱신을 거절했는데 힌트만 남아 있으면
 * 부팅할 때마다 헛된 갱신을 반복한다.
 *
 * **심을 때와 같은 path 여야 브라우저가 지운다.** 백엔드는 path=/ 로 심는다.
 * domain 은 주지 않는다(host-only) — 백엔드도 그렇게 심는다.
 */
export function clearSessionHint(): void {
  document.cookie = `${SESSION_HINT_COOKIE}=; Max-Age=0; path=/`;
}
