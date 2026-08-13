/**
 * 관리자 캐시 키.
 *
 *   auth:admins:{<관리자번호>}:profile       내 정보(/api/admins/me) 응답
 *   auth:admins:{<관리자번호>}:sess:<세션>   로그인 세션(가드가 요청마다 본다)
 *
 * **회원 쪽(`auth:users:...`)과 네임스페이스를 갈라 둔다.** 두 계정 표가 번호를 따로 매겨서,
 * 접두사가 같으면 관리자 3번과 회원 3번이 같은 키를 놓고 다툰다 — 서로의 세션을 살려 주는
 * 사고라 눈에 띄지도 않는다.
 *
 * **관리자번호를 `{}` 로 감싼다.** Redis Cluster 는 키 전체를 해싱해 슬롯을 정하는데,
 * 중괄호가 있으면 그 안쪽만 본다 — 한 계정의 키가 같은 슬롯에 모인다(단일 노드에서는 무해).
 * 회원 키와 같은 규칙이다.
 *
 * **세션 식별자는 문자열이다**(회원 쪽은 숫자). `randomToken` 이 내는 base64url 이라
 * `:` 가 섞이지 않아 키를 조각으로 갈라 읽어도 안전하다.
 *
 * **환경 접두어(`develop:`)는 여기서 붙이지 않는다** — CacheModule 이 붙인다.
 */
const PREFIX = 'auth:admins';

/** 이 관리자의 캐시 전부. 일괄 삭제가 쓰는 패턴의 몸통이다. */
export const adminScope = (adminId: number): string => `${PREFIX}:{${adminId}}`;

export const adminProfileKey = (adminId: number): string => `${adminScope(adminId)}:profile`;

export const adminSessionKey = (adminId: number, sessionId: number): string =>
  `${adminScope(adminId)}:sess:${sessionId}`;

/** 모든 관리자의 내 정보 캐시를 고르는 패턴. 정비 화면의 일괄 삭제가 쓴다. */
export const ALL_ADMIN_PROFILES_MATCH = `*${PREFIX}:*:profile`;

/** 모든 관리자의 세션 캐시를 고르는 패턴. */
export const ALL_ADMIN_SESSIONS_MATCH = `*${PREFIX}:*:sess:*`;

/** 이 관리자의 세션 캐시를 고르는 패턴. */
export const adminSessionsMatch = (adminId: number): string => `*${adminScope(adminId)}:sess:*`;

/**
 * `develop:auth:admins:{12}:sess:AbC…` → `{ adminId: 12, sessionId: 'AbC…' }`.
 *
 * 앞의 환경 접두어는 CacheModule 이 붙이는 것이라 모양이 바뀔 수 있어 **뒤에서부터** 읽는다.
 * 관리자번호는 Cluster 해시태그(`{}`)로 감싸여 있어 벗겨서 본다 — 숫자가 아니거나 `sess`
 * 조각이 없으면 우리 키가 아니다.
 */
export function parseAdminSessionKey(key: string): { adminId: number; sessionId: number } | null {
  const parts = key.split(':');
  if (parts.at(-2) !== 'sess') return null;

  const sessionId = Number(parts.at(-1));
  const adminId = Number(parts.at(-3)?.replace(/^\{|\}$/g, ''));
  if (!Number.isInteger(sessionId) || !Number.isInteger(adminId)) return null;

  return { adminId, sessionId };
}
