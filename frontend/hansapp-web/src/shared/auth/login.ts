import { AUTH_WEB_URL } from '@/shared/config/env';

/**
 * 인증웹(fe/hans-auth)으로 리다이렉트한다.
 *
 * 콘솔은 **자사(1st-party)** 라 OAuth code·PKCE 를 쓰지 않는다 — hans-auth 로 보내 로그인만 하면
 * 백엔드가 `.plzhans.com` 공유 refresh 쿠키를 깔고, hans-auth 가 이 앱(return)으로 되돌려보낸다.
 * 복귀 후 authStore.bootstrap 의 refreshSession() 이 그 쿠키로 세션을 인지한다(code 교환 없음).
 */
export function startLogin(returnTo: string = window.location.href): void {
  const params = new URLSearchParams({ return: returnTo });
  window.location.href = `${AUTH_WEB_URL}/login?${params.toString()}`;
}

/**
 * 인증웹의 로그아웃으로 보낸다. **콘솔이 직접 로그아웃하지 않는다.**
 *
 * 세션은 `.plzhans.com` 공유 쿠키 하나인데, 각 앱이 알아서 로그아웃하면 자기 오리진의
 * localStorage 만 지워진다. 다른 앱에는 만료 전 access token 이 남아 자기가 로그인 상태라고
 * 우기고, 서로 상대에게 떠넘기며 무한 왕복한다. 그래서 로그인처럼 한 곳을 지나게 한다.
 */
export function startLogout(returnTo: string = window.location.origin): void {
  const params = new URLSearchParams({ return: returnTo });
  window.location.href = `${AUTH_WEB_URL}/logout?${params.toString()}`;
}
