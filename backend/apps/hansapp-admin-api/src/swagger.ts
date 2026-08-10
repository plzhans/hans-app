import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

import { buildInfo } from './build-info';

export const SWAGGER_PATH = 'docs';
export const OPENAPI_JSON_PATH = 'openapi.json';

/** Bearer 인증 스킴 이름. @ApiBearerAuth() 없이 전역 요구로 건다(대부분의 라우트가 인증이다). */
export const BEARER_SCHEME = 'bearer';

/**
 * 관리자 API 문서.
 *
 * **공개 API 문서와 달리 servers 목록을 넣지 않는다.** 이 스펙은 외부에 배포되지 않고
 * 브라우저가 열고 있는 그 오리진에서만 쓰이므로, Swagger UI 의 기본 동작(현재 오리진)이 맞다.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Hans Admin API')
    .setDescription('관리자 API 문서. 공개 API 와 인증을 공유하지 않는다.')
    .setVersion(buildInfo().semver)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '관리자 access token. POST /auth/login 으로 받는다.',
      },
      BEARER_SCHEME,
    )
    // 전역 요구. 대부분의 라우트가 인증이고 예외는 @AdminPublic() 몇 개뿐이라,
    // 하나하나 @ApiBearerAuth() 를 붙이는 것보다 빠뜨릴 여지가 없다.
    .addSecurityRequirements(BEARER_SCHEME);

  return SwaggerModule.createDocument(app, builder.build());
}
