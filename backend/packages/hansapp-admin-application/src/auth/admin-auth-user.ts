/**
 * 요청에 실린 관리자 인증 결과. 가드가 `request.admin` 에 채운다.
 *
 * **`request.user` 가 아니라 `request.admin` 이다.** 이름을 겹치게 두면 공개 API 의
 * AuthUser 를 기대하는 코드가 조용히 여기에 붙는다 — 두 계층을 가른 이유가 그것이다.
 */
export interface AdminAuthUser {
  /** 관리자 번호 */
  readonly adminId: number;
  /** 이 access token 이 속한 refresh 세션 식별자(난수). **계정 안에서만 유일하다.** */
  readonly sessionId: number;
  /** 비밀번호를 바꾸기 전까지 다른 API 를 쓸 수 없는 상태인가. */
  readonly mustChangePassword: boolean;
}

/** admin access token(JWT) 페이로드. */
export interface AdminAccessTokenPayload {
  /** subject = 관리자 번호(문자열) */
  sub: string;
  /** 세션 식별자(난수). 계정 안에서만 유일하다 — sub 와 짝으로만 뜻이 있다. */
  sid: number;
  /**
   * 비밀번호 변경이 필요한 상태. 필요할 때만 실린다(없으면 false).
   *
   * **DB 가 아니라 토큰에 싣는 이유**는 가드가 요청마다 DB 를 보지 않게 하려는 것이다.
   * **이 플래그만 세션 캐시가 못 잡는다.** 폐기는 가드가 요청마다 확인하지만 이 값은
   * 토큰에 박혀 있어, 초기화하면서 세션을 남겨 두면 최대 access TTL(기본 1시간)만큼
   * 늦게 걸린다. 세션을 함께 끊으면(기본값) 그 자리에서 다시 로그인하며 반영된다.
   */
  chg?: boolean;
  /**
   * 만료(epoch 초). **서명할 때가 아니라 검증할 때 실려 온다** — jsonwebtoken 이 넣는 값이다.
   *
   * 가드가 세션 캐시에 넘겨, 이 토큰이 쓸모없어지는 시각을 넘겨서까지 판단을 들고 있지
   * 않게 한다(그 뒤에는 갱신을 거치며 어차피 DB 를 본다).
   */
  exp?: number;
}
