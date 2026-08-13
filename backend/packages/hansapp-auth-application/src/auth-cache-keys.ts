/**
 * 회원 캐시 키. **한 회원의 것이 한 가지 아래 모인다.**
 *
 *   auth:users:{<회원번호>}:profile        내 정보(/users/me) 응답
 *   auth:users:{<회원번호>}:sess:<세션>    로그인 세션(가드가 요청마다 본다)
 *
 * 이렇게 묶어 두면 두 가지가 된다 —
 *
 *  - **한 회원의 캐시를 통째로 지운다.** `auth:users:<회원번호>:*` 하나로 끝난다.
 *    종류가 늘어도 지우는 쪽 코드는 그대로다.
 *  - **남의 것을 건드릴 수 없다.** 식별자 하나로 열리는 키가 없어서, 회원 확인을 잊은
 *    코드가 곧바로 구멍이 되는 일이 없다.
 *
 * **회원번호를 `{}` 로 감싼다.** Redis Cluster 는 키 전체를 해싱해 슬롯을 정하는데, 중괄호가
 * 있으면 그 안쪽만 본다 — 한 회원의 profile 과 sess 가 **같은 슬롯**에 모인다. 그래야
 * 나중에 다중키 삭제나 트랜잭션으로 한 회원 것을 한 번에 다룰 수 있다.
 * 단일 노드에서는 아무 영향이 없다(병원 캐시 `hospital:{<id>}:base` 와 같은 방식).
 *
 * **환경 접두어(`develop:`)는 여기서 붙이지 않는다** — CacheModule 이 붙인다.
 *
 * **관리자 계층과 정리 배치가 같은 형식을 다시 적는다**(그쪽은 이 패키지를 의존하지
 * 않는다). 여기를 고치면 그 자리들도 함께 고쳐야 한다.
 */
export const AUTH_USER_PREFIX = 'auth:users';

/** 이 회원의 캐시 전부. 일괄 삭제가 쓰는 패턴의 몸통이다. */
export const userScope = (userId: number): string => `${AUTH_USER_PREFIX}:{${userId}}`;

export const profileKey = (userId: number): string => `${userScope(userId)}:profile`;

export const sessionKey = (userId: number, sessionId: number): string =>
  `${userScope(userId)}:sess:${sessionId}`;
