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

/**
 * 로그인 힌트 쿠키(백엔드가 로그인 때 세팅한 non-httpOnly `hansapp.session` flag) 존재 여부.
 * **이게 있을 때만** refresh 를 호출한다 — 로그아웃 상태에서 불필요한 /oauth/token 400 을 없앤다.
 * 인증 판단이 아니라 "호출 여부" 판단용(값은 신뢰하지 않는다).
 */
export function hasSessionHint(): boolean {
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith('hansapp.session='));
}
