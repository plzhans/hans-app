import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { AuthType } from './auth-type.enum';

/** 라우트/컨트롤러가 지원하는 인증 방식 목록을 담는 메타데이터 키. */
export const AUTH_TYPES_KEY = 'authTypes';

/**
 * X-Client-Id 헤더 보안 스키마 이름(Swagger). 실제 스키마 등록은 서버(문서) 계층이 한다.
 * 이름이 그쪽 addApiKey(...) 등록명과 일치해야 문서 UI 의 Authorize 입력과 연결된다.
 */
export const CLIENT_ID_SCHEME = 'client-id';

/**
 * 컨트롤러(또는 핸들러)가 지원하는 인증 방식을 명시한다.
 * - 메타데이터로 지원 방식을 기록해 AuthGuard 가 검증에 활용한다.
 * - 문서(OpenAPI)에 인증 요구를 표시한다: 항상 Bearer(JWT·서비스 키 공용),
 *   ApiKey 방식을 지원하면 X-Client-Id 헤더 입력도 노출한다.
 *
 * 예) @Auth(AuthType.Jwt) / @Auth(AuthType.Jwt, AuthType.ApiKey)
 */
export function Auth(...types: AuthType[]) {
  const supported = types.length ? types : [AuthType.Jwt];
  const decorators = [SetMetadata(AUTH_TYPES_KEY, supported), ApiBearerAuth()];
  // API 접근을 지원하면(서비스 키는 Bearer, 클라이언트는 X-Client-Id 헤더) 헤더 입력을 문서에 노출.
  if (supported.includes(AuthType.ApiKey)) {
    decorators.push(ApiSecurity(CLIENT_ID_SCHEME));
  }
  return applyDecorators(...decorators);
}
