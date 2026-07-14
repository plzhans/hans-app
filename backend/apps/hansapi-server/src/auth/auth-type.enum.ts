/**
 * 지원하는 인증 방식. 현재는 모두 Authorization: Bearer 헤더로 토큰을 수신하며,
 * 토큰 값의 접두사로 실제 방식을 구분한다(추후 구현).
 */
export enum AuthType {
  /** JWT 토큰 */
  Jwt = 'jwt',
  /** API Key */
  ApiKey = 'apikey',
}
