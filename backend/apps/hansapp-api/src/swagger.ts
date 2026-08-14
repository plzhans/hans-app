import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

import { resolveAppEnv, type AppEnv } from '@hansapp/common';
import { gateNonApiControllers, retagInternalOperations } from '@hansapp/http-common';

import { buildInfo } from './build-info';
import { mergeKrDataSchemas } from './krdata-schemas';

// Swagger UI 경로. production 이 아닐 때만 문서를 노출한다.
export const SWAGGER_PATH = 'docs';
// OpenAPI(JSON) 스펙 경로. 스프링(springdoc)과 구조를 통일하기 위해 /openapi.json 으로 서빙한다.
// (기본값 /docs-json 대신 사용)
export const OPENAPI_JSON_PATH = 'openapi.json';

// Bearer 인증 정의. Authorization: Bearer <token> 로 보낸다.
//  - 사용자 access token(JWT)  또는  서비스 키(sk_{appId}_{keyId}_{rand}) 공용.
// securityScheme 이름(스펙/문서 UI 에서 참조하는 키).
export const BEARER_SCHEME = 'bearer';
// 클라이언트 인증 정의. X-Client-Id 헤더로 공개 클라이언트 식별자를 보낸다(WEB 은 오리진도 검사).
export const CLIENT_ID_SCHEME = 'client-id';
export const CLIENT_ID_HEADER = 'X-Client-Id';

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
  url: 'https://develop-api.plzhans.com',
  description: 'Development',
};
const PRODUCTION: ServerDef = {
  url: 'https://api.plzhans.com',
  description: 'Production',
};

// 빌드 대상 환경별로 openapi.json 의 servers 목록(순서)을 다르게 구성한다. APP_ENV 로 고른다.
// - local:      Local 을 먼저, Development 를 보조로
// - develop:    Development 를 먼저, Local 을 보조로
// - production: Production 만 노출
const SERVERS_BY_ENV: Record<AppEnv, ServerDef[]> = {
  local: [LOCAL, DEVELOPMENT],
  develop: [DEVELOPMENT, LOCAL],
  production: [PRODUCTION],
};

/**
 * "url|설명;url|설명" 형태의 문자열을 servers 목록으로 파싱한다.
 * - 항목 구분: 세미콜론(;), url|설명 구분: 파이프(|)
 * - 설명 생략 시 url 을 설명으로 쓴다. 빈 항목/빈 url 은 버린다.
 * 파싱 결과가 비면 undefined 를 돌려 상위(env/기본)로 폴백하게 한다.
 */
export function parseServersSpec(spec: string | undefined): ServerDef[] | undefined {
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
  return parseServersSpec(process.env.OPENAPI_SERVERS) ?? SERVERS_BY_ENV[resolveAppEnv()];
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
    // 여기는 sha 가 붙지 않은 semver 다(0.0.1). 이 함수가 커밋되는 스펙 파일도 만들기 때문에
    // (openapi:gen → docs/openapi/hansapp-openapi.json), sha 를 넣으면 커밋마다 스펙이 바뀐다.
    //
    // 이전 값(process.env.npm_package_version ?? '0.0.1')은 `pnpm run` 으로 띄울 때만 들어와서,
    // 운영(node dist/main)에서는 늘 폴백인 '0.0.1' 이 찍혔다. 이제 package.json 이 유일한 출처다.
    //
    // "떠 있는 서버가 어느 커밋이냐" 는 GET /version 이 sha 까지 답한다.
    .setVersion(buildInfo().semver)
    // Bearer 토큰 인증 스킴을 선언한다. 전역 요구가 아니라 @Auth() 데코레이터가 붙은
    // 컨트롤러/핸들러에만 적용된다(@ApiBearerAuth). 헬스체크(@Public)에는 적용되지 않는다.
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT or service key(sk_...)',
        description: '사용자 access token(JWT) 또는 서비스 키(sk_{appId}_{keyId}_{rand}).',
      },
      BEARER_SCHEME,
    )
    // 클라이언트 인증: X-Client-Id 헤더. 서비스 키 없이 이 헤더만 보내면 클라이언트로 인증한다.
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: CLIENT_ID_HEADER,
        description: '공개 클라이언트 식별자(clientId). WEB 은 Origin 도 검사됨.',
      },
      CLIENT_ID_SCHEME,
    );

  // servers 목록(오버라이드 > OPENAPI_SERVERS env > 기본)을 순서대로 넣는다.
  for (const server of resolveServers(options?.servers)) {
    builder.addServer(server.url, server.description);
  }

  // 문서의 제1조건. @ApiController 로 선언하지 않은 컨트롤러를 통째로 걷어낸다.
  // createDocument 보다 먼저 돌아야 한다 — 스캐너가 클래스 판정을 그 시점에 읽는다.
  gateNonApiControllers(app);

  const document = SwaggerModule.createDocument(app, builder.build());

  // 내부 전용 API 를 켰을 때만 의미가 있다. 공개 문서에서는 대상이 없어 아무 일도 하지 않는다.
  retagInternalOperations(document);

  // nmc/hira 응답은 원본 API 구조를 그대로 돌려준다. 그 스키마(필드 설명 포함)는
  // 우리가 소유한 SDK 스펙에 이미 있으므로 문서에 합쳐 넣고 $ref 로 가리킨다.
  mergeKrDataSchemas(document);

  return document;
}
