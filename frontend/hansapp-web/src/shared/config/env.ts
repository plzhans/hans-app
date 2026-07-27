/** 인증 백엔드(api.plzhans.com) base URL. .env.* 의 VITE_HANSAPI_BASE_URL 로 주입. */
export const API_BASE_URL =
  (import.meta.env.VITE_HANSAPI_BASE_URL as string | undefined) ?? '';

/**
 * 로그인 포털(hansapp-auth) base URL. VITE_AUTH_WEB_URL 로 주입.
 * 콘솔은 이 포털로 리다이렉트해 로그인한다(자기 로그인 UI 를 갖지 않는다).
 */
export const AUTH_WEB_URL =
  (import.meta.env.VITE_AUTH_WEB_URL as string | undefined) ?? '';

/**
 * 이 콘솔의 등록 OAuth 클라이언트 ID. VITE_HANSAPI_CLIENT_ID 로 주입.
 * 포털 로그인·토큰 교환이 이 클라이언트에 귀속된다(medifinder 와 같은 방식).
 */
export const CLIENT_ID =
  (import.meta.env.VITE_HANSAPI_CLIENT_ID as string | undefined) ?? '';
