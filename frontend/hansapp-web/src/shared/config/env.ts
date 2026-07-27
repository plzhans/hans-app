/** 인증 백엔드(api.plzhans.com) base URL. .env.* 의 VITE_HANSAPI_BASE_URL 로 주입. */
export const API_BASE_URL =
  (import.meta.env.VITE_HANSAPI_BASE_URL as string | undefined) ?? '';

/**
 * 로그인 포털(hans-auth) base URL. VITE_AUTH_WEB_URL 로 주입.
 * 콘솔은 자기 로그인 UI 없이 이 포털로 리다이렉트해 로그인하고, 공유 쿠키로 세션을 인지한다(1st-party).
 */
export const AUTH_WEB_URL =
  (import.meta.env.VITE_AUTH_WEB_URL as string | undefined) ?? '';
