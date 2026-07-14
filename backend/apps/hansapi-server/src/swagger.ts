import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

import { mergeKrDataSchemas } from './krdata-schemas';

// Swagger UI 경로. production 이 아닐 때만 문서를 노출한다.
export const SWAGGER_PATH = 'docs';
// OpenAPI(JSON) 스펙 경로. 스프링(springdoc)과 구조를 통일하기 위해 /openapi.json 으로 서빙한다.
// (기본값 /docs-json 대신 사용)
export const OPENAPI_JSON_PATH = 'openapi.json';

// Bearer 토큰 인증 정의. API 키를 Authorization: Bearer <token> 헤더로 보낸다.
// 모든 오퍼레이션에 전역으로 적용한다.
// - securityScheme 이름(스펙 문서/문서 UI 에서 참조하는 키)
export const BEARER_SCHEME = 'bearer';
// - 문서 "Try it" 플레이그라운드에 기본으로 채워 넣을 토큰(임시 고정값).
//   추후 실제 발급 토큰으로 대체한다.
const BEARER_EXAMPLE = 'test';

type AppEnv = 'local' | 'development' | 'production';

interface ServerDef {
  url: string;
  description: string;
}

// 각 환경의 API base URL 정의. Local 은 실제 포트(PORT 또는 기본 3000)를 URL 에 박아 넣는다.
const LOCAL: ServerDef = {
  url: `http://127.0.0.1:${process.env.PORT ?? '3000'}`,
  description: 'Local',
};
const DEVELOPMENT: ServerDef = {
  url: 'https://development-api.plzhans.com',
  description: 'Development',
};
const PRODUCTION: ServerDef = {
  url: 'https://api.plzhans.com',
  description: 'Production',
};

// 빌드 대상 환경별로 openapi.json 의 servers 목록(순서)을 다르게 구성한다.
// - local:       Local 을 먼저, Development 를 보조로
// - development: Development 를 먼저, Local 을 보조로
// - production:  Production 만 노출
const SERVERS_BY_ENV: Record<AppEnv, ServerDef[]> = {
  local: [LOCAL, DEVELOPMENT],
  development: [DEVELOPMENT, LOCAL],
  production: [PRODUCTION],
};

/**
 * 대상 환경을 결정한다. NODE_ENV 로 지정하며(local|development|production),
 * 없으면 local 로 본다. dev/develop, prod 같은 축약형도 허용한다.
 * (로컬 실행 start:dev/start:debug 는 NODE_ENV=local 이라 local 로 해석되어
 *  servers 목록 첫 번째가 127.0.0.1 이 된다. 배포된 dev 환경은 NODE_ENV=development 를 준다.)
 */
function resolveAppEnv(): AppEnv {
  const raw = (process.env.NODE_ENV ?? 'local').toLowerCase();
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'development' || raw === 'develop' || raw === 'dev') {
    return 'development';
  }
  return 'local';
}

/**
 * "url|설명;url|설명" 형태의 문자열을 servers 목록으로 파싱한다.
 * - 항목 구분: 세미콜론(;), url|설명 구분: 파이프(|)
 * - 설명 생략 시 url 을 설명으로 쓴다. 빈 항목/빈 url 은 버린다.
 * 파싱 결과가 비면 undefined 를 돌려 상위(env/기본)로 폴백하게 한다.
 */
export function parseServersSpec(
  spec: string | undefined,
): ServerDef[] | undefined {
  if (!spec?.trim()) return undefined;
  const servers = spec
    .split(';')
    .map((entry) => {
      const [url, description] = entry.split('|');
      return { url: url.trim(), description: (description ?? url).trim() };
    })
    .filter((s) => s.url);
  return servers.length ? servers : undefined;
}

/**
 * openapi.json 의 servers 목록을 결정한다. 우선순위:
 *   1) 명시 오버라이드(override)      — CLI(--server) 로 주입 (generate-openapi)
 *   2) OPENAPI_SERVERS 환경변수        — CI 등에서 확정 도메인 주입 (런타임·생성 공통)
 *   3) SERVERS_BY_ENV[env]            — 기본(하드코딩)
 * 1·2 가 있으면 기본 목록을 "대체"한다(prepend 아님).
 */
function resolveServers(override?: ServerDef[]): ServerDef[] {
  if (override?.length) return override;
  return (
    parseServersSpec(process.env.OPENAPI_SERVERS) ??
    SERVERS_BY_ENV[resolveAppEnv()]
  );
}

/**
 * OpenAPI 문서를 생성한다. 런타임 서빙(main.ts)과 정적 스펙 내보내기(generate-openapi.ts)에서
 * 동일한 설정을 쓰도록 한 곳에 모아둔다.
 */
export function buildOpenApiDocument(
  app: INestApplication,
  options?: { servers?: ServerDef[] },
): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Hans API')
    .setDescription('Hans API backend 문서')
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    // Bearer 토큰 인증 스킴을 선언한다. 전역 요구가 아니라 @Auth() 데코레이터가 붙은
    // 컨트롤러/핸들러에만 적용된다(@ApiBearerAuth). 헬스체크(@Public)에는 적용되지 않는다.
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'API Key' },
      BEARER_SCHEME,
    );

  // servers 목록(오버라이드 > OPENAPI_SERVERS env > 기본)을 순서대로 넣는다.
  for (const server of resolveServers(options?.servers)) {
    builder.addServer(server.url, server.description);
  }

  const document = SwaggerModule.createDocument(app, builder.build());

  // nmc/hira 응답은 원본 API 구조를 그대로 돌려준다. 그 스키마(필드 설명 포함)는
  // 우리가 소유한 SDK 스펙에 이미 있으므로 문서에 합쳐 넣고 $ref 로 가리킨다.
  mergeKrDataSchemas(document);

  // 문서 "Try it" 플레이그라운드가 토큰 입력을 기본값으로 채우도록 securityScheme 에
  // 예시값을 심는다. 단 production 환경 스펙에는 기본 토큰을 노출하지 않는다.
  const scheme = document.components?.securitySchemes?.[BEARER_SCHEME];
  if (scheme && !('$ref' in scheme) && resolveAppEnv() !== 'production') {
    Object.assign(scheme, {
      example: BEARER_EXAMPLE,
      'x-example': BEARER_EXAMPLE,
    });
  }

  return document;
}
