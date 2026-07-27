import { Preferences } from '@capacitor/preferences';

/**
 * 토큰 영속 저장소. Capacitor Preferences 를 써서 **웹(localStorage)과 모바일(iOS/Android)
 * 동일 API** 로 보관한다. 추후 앱을 Capacitor 로 감싸면 코드 변경 없이 네이티브 저장소를 쓴다.
 */
const KEY = 'plzhans.auth.tokens';

export interface StoredTokens {
  /** access token(단명). refresh 는 저장하지 않는다 — httpOnly 쿠키로만 오간다(XSS 시 탈취 방지). */
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
