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
  readonly sessionId: string;
}

/** access token(JWT) 페이로드. */
export interface AccessTokenPayload {
  /** subject = 회원번호(문자열) */
  sub: string;
  /** 권한 */
  role: UserRole;
  /** 세션 식별자 */
  sid: string;
}
