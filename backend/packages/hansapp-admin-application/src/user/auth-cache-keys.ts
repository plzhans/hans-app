/**
 * 회원 캐시 키.
 *
 *   auth:users:{<회원번호>}:profile        내 정보(/users/me) 응답
 *   auth:users:{<회원번호>}:sess:<세션>    로그인 세션
 *
 * 회원번호를 `{}` 로 감싸는 것은 Redis Cluster 의 해시태그다 — 한 회원의 캐시가 같은
 * 슬롯에 모여야 다중키로 한 번에 다룰 수 있다(단일 노드에서는 무해).
 *
 * **정본은 인증 계층이다**(packages/hansapp-auth-application/src/auth-cache-keys.ts).
 * 여기서 형식을 다시 적는 것은 관리자 계층이 그 계층을 의존하지 않기 위해서다 —
 * 그쪽이 바뀌면 이 파일도 함께 고쳐야 한다(글 캐시 무효화와 같은 방식).
 *
 * 환경 접두어(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */
const PREFIX = 'auth:users';

/** 이 회원의 캐시 전부. 일괄 삭제가 쓰는 패턴의 몸통이다. */
export const userScope = (userId: number): string => `${PREFIX}:{${userId}}`;

export const profileKey = (userId: number): string => `${userScope(userId)}:profile`;

export const sessionKey = (userId: number, sessionId: number): string =>
  `${userScope(userId)}:sess:${sessionId}`;

/** 모든 회원의 내 정보 캐시를 고르는 패턴. */
export const ALL_PROFILES_MATCH = `*${PREFIX}:*:profile`;

/** 모든 회원의 세션 캐시를 고르는 패턴. */
export const ALL_SESSIONS_MATCH = `*${PREFIX}:*:sess:*`;

/** 이 회원의 세션 캐시를 고르는 패턴. */
export const sessionsMatch = (userId: number): string => `*${userScope(userId)}:sess:*`;

/**
 * `develop:auth:users:{12}:sess:34` → `{ userId: 12, sessionId: 34 }`.
 *
 * 앞의 환경 접두어는 CacheModule 이 붙이는 것이라 모양이 바뀔 수 있어 **뒤에서부터** 읽는다.
 * 회원번호는 Cluster 해시태그(`{}`)로 감싸여 있어 벗겨서 본다 — 숫자가 아니거나 `sess`
 * 조각이 없으면 우리 키가 아니다.
 */
export function parseSessionKey(key: string): { userId: number; sessionId: number } | null {
  const parts = key.split(':');
  if (parts.at(-2) !== 'sess') return null;

  const sessionId = Number(parts.at(-1));
  const userId = Number(parts.at(-3)?.replace(/^\{|\}$/g, ''));
  if (!Number.isInteger(sessionId) || !Number.isInteger(userId)) return null;

  return { userId, sessionId };
}
