/** 인증 백엔드(api.plzhans.com) base URL. .env.* 의 VITE_HANSAPI_BASE_URL 로 주입. */
export const API_BASE_URL =
  (import.meta.env.VITE_HANSAPI_BASE_URL as string | undefined) ?? '';
