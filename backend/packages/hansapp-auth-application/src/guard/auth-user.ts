import { UserRole } from '@hansapp/data';

/**
 * 인증된 요청에 담기는 사용자 정보. AuthGuard 가 access token 을 검증한 뒤
 * request.user 에 채운다. @CurrentUser() 로 핸들러에서 꺼낸다.
 */
export interface AuthUser {
  /** 회원번호 */
  readonly userId: number;
  /** 권한 */
  readonly role: UserRole;
  /** 이 access token 이 속한 refresh 세션 식별자 */
  readonly sessionId: number;
}

/** access token(JWT) 페이로드. */
export interface AccessTokenPayload {
  /** subject = 회원번호(문자열) */
  sub: string;
  /** 권한 */
  role: UserRole;
  /** 세션 식별자. **회원 안에서만 유일하다**(키가 복합키다). */
  sid: number;
  /**
   * 만료 시각(epoch 초). **서명할 때 jsonwebtoken 이 넣는다** — 우리가 페이로드에 적지
   * 않지만 검증 결과에는 들어 있다.
   *
   * 세션 캐시가 이 값을 쓴다. access token 은 발급 시점에 만료가 정해지고 이후 바뀌지
   * 않으므로, 그 시각을 넘겨 "이 세션이 살아 있다" 를 들고 있을 이유가 없다.
   */
  exp?: number;
}
