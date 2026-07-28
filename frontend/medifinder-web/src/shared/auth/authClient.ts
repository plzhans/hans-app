import { createAuthClient } from '@hansapp/auth-sdk';

/**
 * HansApp 로그인 SDK 클라이언트(싱글턴).
 * - authWebUrl: plzhans 로그인 UI(hansapp-web)
 * - apiBaseUrl: 인증 API
 * 로그인 후 이 앱의 /auth/callback 으로 code 가 돌아온다.
 */
export const authClient = createAuthClient({
  authWebUrl: import.meta.env.VITE_AUTH_WEB_URL as string,
  apiBaseUrl: import.meta.env.VITE_HANSAPP_BASE_URL as string,
  // 데이터 API 의 X-Client-Id 와 같은 값이다. 로그인·토큰 교환도 이 클라이언트에 귀속된다.
  clientId: import.meta.env.VITE_HANSAPP_CLIENT_ID as string,
  callbackPath: '/auth/callback',
  storageKey: 'medifinder.auth',
});
