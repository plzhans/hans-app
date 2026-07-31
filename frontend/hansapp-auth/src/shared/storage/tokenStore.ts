/**
 * access token 영속 저장소.
 *
 * **localStorage 를 직접 쓴다.** 예전엔 Capacitor Preferences 를 썼는데, 그 명분은 "나중에 이
 * 앱을 Capacitor 로 감쌀 때 코드 변경 없이" 였다. 그런데 인증웹·포털웹은 네이티브가 될 일이
 * 없다 — 네이티브 앱이 로그인할 때도 인증웹은 시스템 브라우저에서 열리는 웹페이지다.
 * 얻는 것 없이 `CapacitorStorage.` 접두사만 붙어 프로필 캐시(hansapp.me)와 규칙이 어긋났다.
 * (네이티브가 될 수 있는 medifinder 는 auth-sdk 에서 Preferences 를 그대로 쓴다.)
 *
 * **access token 만 저장한다.** refresh 는 저장소에 두지 않는다 — httpOnly 쿠키로만 오가게 해
 * XSS 로도 못 읽게 한다(refresh 유출 = 장기 계정 탈취). access 는 단명(1h)이라 피해가 제한된다.
 *
 * **값은 JWT 문자열 그대로다.** 담을 것이 하나뿐이고 refresh 는 앞으로도 안 담으므로 감쌀 이유가
 * 없다. 만료 시각도 JWT 안에 있어 따로 적어둘 것이 없다(session.ts 의 isAccessTokenValid).
 * 쿠키의 hansapp.refresh_token 이 값 자체를 담는 것과도 짝이 맞는다.
 */
const KEY = 'hansapp.access_token';

export function saveAccessToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // 저장소 불가(사파리 프라이빗 등)면 메모리 세션으로만 동작한다.
  }
}

export function loadAccessToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
