import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthType } from './auth-type.enum';

/** 라우트/컨트롤러가 지원하는 인증 방식 목록을 담는 메타데이터 키. */
export const AUTH_TYPES_KEY = 'authTypes';

/**
 * 컨트롤러(또는 핸들러)가 지원하는 인증 방식을 명시한다.
 * - 메타데이터로 지원 방식을 기록해 AuthGuard 가 검증에 활용한다.
 * - 문서(OpenAPI)에는 해당 대상이 Bearer 인증을 요구함을 표시한다.
 *
 * Swagger 보안 스키마 이름은 서버(문서) 계층이 등록하므로, 여기서는 기본 스키마명을 쓴다.
 *
 * 예) @Auth(AuthType.Jwt)
 */
export function Auth(...types: AuthType[]) {
  const supported = types.length ? types : [AuthType.Jwt];
  return applyDecorators(
    SetMetadata(AUTH_TYPES_KEY, supported),
    ApiBearerAuth(),
  );
}
