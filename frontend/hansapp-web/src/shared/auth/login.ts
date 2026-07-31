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
