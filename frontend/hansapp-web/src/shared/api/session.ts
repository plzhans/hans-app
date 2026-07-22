import {
  clearTokens,
  loadTokens,
  saveTokens,
  type StoredTokens,
} from '@/shared/storage/tokenStore';

/**
 * 현재 토큰의 인메모리 캐시. 매 요청마다 비동기 저장소를 읽지 않도록 부팅 시 1회 hydrate 하고
 * 로그인/갱신 때 갱신한다. 영속 저장소(tokenStore)와 항상 동기화한다.
 */
let current: StoredTokens | null = null;

export function getSession(): StoredTokens | null {
  return current;
}

export async function hydrateSession(): Promise<StoredTokens | null> {
  current = await loadTokens();
  return current;
}

export async function setSession(tokens: StoredTokens): Promise<void> {
  current = tokens;
  await saveTokens(tokens);
}

export async function clearSession(): Promise<void> {
  current = null;
  await clearTokens();
}
