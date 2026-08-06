import { AUTH_WEB_URL } from '@/shared/config/env';

/**
 * 인증웹(fe/hans-auth)으로 리다이렉트한다.
 *
 * 콘솔은 **자사(1st-party)** 라 OAuth code·PKCE 를 쓰지 않는다 — hans-auth 로 보내 로그인만 하면
 * 백엔드가 `.plzhans.com` 공유 refresh 쿠키를 깔고, hans-auth 가 이 앱(return)으로 되돌려보낸다.
 * 복귀 후 authStore.bootstrap 의 refreshSession() 이 그 쿠키로 세션을 인지한다(code 교환 없음).
 *
 * **replace 다. assign(`location.href = …`)이면 뒤로가기가 갇힌다.**
 * 로그인이 필요한 화면(RequireAuth)은 열리자마자 여기로 보내는데, assign 은 그 화면을
 * 히스토리에 남긴다. 로그인 화면에서 뒤로가기를 누르면 → 그 화면으로 돌아옴 → 또 여기로
 * 보냄 → 사용자는 영영 못 빠져나온다(bfcache 로 복원되면 스피너인 채로 멈춘다).
 * replace 로 그 화면을 히스토리에서 지우면 뒤로가기가 **그 앞의 화면**(보통 첫 페이지)으로 간다.
 *
 * 로그인에 성공하면 returnTo 로 돌아오므로, 지운다고 갈 곳을 잃지 않는다.
 */
export function startLogin(returnTo: string = window.location.href): void {
  const params = new URLSearchParams({ return: returnTo });
  window.location.replace(`${AUTH_WEB_URL}/login?${params.toString()}`);
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
  // 로그인과 같은 이유로 replace 다 — 로그아웃한 뒤 뒤로가기로 로그인 필요 화면에 되돌아가면
  // 거기서 다시 로그인으로 튕겨 나간다. 방금 로그아웃한 사람에게는 더 어이없는 흐름이다.
  window.location.replace(`${AUTH_WEB_URL}/logout?${params.toString()}`);
}
