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
  /*
    저장 키 접두사. **다른 앱과 겹치면 안 된다** — 토큰을 세션 쿠키에 두는데 쿠키는 포트를
    가리지 않아서, 로컬에서 같은 127.0.0.1 에 뜨는 포털·인증웹·콘솔과 이름이 부딪힌다.
    토큰(medifinder.auth)·PKCE(medifinder.auth.pkce.*)·탭 통신 채널이 여기서 갈라진다.
  */
  storageKey: 'medifinder.auth',
  /*
    **브라우저를 닫으면 로그인도 끝난다**(세션 쿠키). 백엔드가 없어 토큰을 httpOnly 쿠키에
    둘 수 없는 앱이라, 기기에 남는 시간을 줄이는 쪽을 택했다 — 병원을 찾아보는 사람 중에는
    공용 PC 나 남의 기기를 쓰는 경우가 있다.

    sessionStorage 가 아니라 쿠키인 이유는 **범위**다. sessionStorage 도 창을 닫으면 지워지지만
    탭 하나가 범위라, 주소를 직접 쳐서 연 새 탭이 익명이 된다. 세션 쿠키는 창이 열려 있는
    동안 모든 탭이 공유한다(storage.ts 주석 참고).
  */
  persistence: 'browser',
});
