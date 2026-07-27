import { Preferences } from '@capacitor/preferences';

/**
 * 토큰 영속 저장소. Capacitor Preferences 를 써서 **웹(localStorage)과 모바일(iOS/Android)
 * 동일 API** 로 보관한다. 추후 앱을 Capacitor 로 감싸면 코드 변경 없이 네이티브 저장소를 쓴다.
 *
 * **access token 만 저장한다.** refresh 는 저장소(웹=localStorage)에 두지 않는다 — httpOnly 쿠키로만
 * 오가게 해 XSS 로도 못 읽게 한다(refresh 유출 = 장기 계정 탈취). access 는 단명(1h)이고, 새로고침 시
 * 서버를 안 때리려 exp 를 로컬 검증해 재사용한다(만료 시에만 쿠키로 refresh).
 */
const KEY = 'plzhans.auth.tokens';

export interface StoredTokens {
  accessToken: string;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(tokens) });
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as StoredTokens;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await Preferences.remove({ key: KEY });
}
