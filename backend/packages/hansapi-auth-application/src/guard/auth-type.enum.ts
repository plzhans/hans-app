/**
 * 지원하는 인증 방식. 현재는 모두 Authorization: Bearer 헤더로 토큰을 수신한다.
 * JWT 는 access token, ApiKey 는 서버간 호출용(추후) 이다.
 */
export enum AuthType {
  /** 사용자 access token(JWT) */
  Jwt = 'jwt',
  /** API Key(서버간, 추후) */
  ApiKey = 'apikey',
}
