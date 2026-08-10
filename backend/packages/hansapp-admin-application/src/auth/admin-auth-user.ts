/**
 * 요청에 실린 관리자 인증 결과. 가드가 `request.admin` 에 채운다.
 *
 * **`request.user` 가 아니라 `request.admin` 이다.** 이름을 겹치게 두면 공개 API 의
 * AuthUser 를 기대하는 코드가 조용히 여기에 붙는다 — 두 계층을 가른 이유가 그것이다.
 */
export interface AdminAuthUser {
  /** 관리자 번호 */
  readonly adminId: number;
  /** 이 access token 이 속한 refresh 세션 식별자 */
  readonly sessionId: string;
  /** 비밀번호를 바꾸기 전까지 다른 API 를 쓸 수 없는 상태인가. */
  readonly mustChangePassword: boolean;
}

/** admin access token(JWT) 페이로드. */
export interface AdminAccessTokenPayload {
  /** subject = 관리자 번호(문자열) */
  sub: string;
  /** 세션 식별자 */
  sid: string;
  /**
   * 비밀번호 변경이 필요한 상태. 필요할 때만 실린다(없으면 false).
   *
   * **DB 가 아니라 토큰에 싣는 이유**는 가드가 요청마다 DB 를 보지 않게 하려는 것이다.
   * 토큰 TTL 이 5분이라 DB 와 어긋나는 창도 그만큼이고, 비밀번호를 바꾸면 그 자리에서
   * 새 토큰을 발급하므로 실제로는 즉시 반영된다.
   */
  chg?: boolean;
}
