import { Logger, ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { config } from 'dotenv';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import { exitIfVersionFlag, loadEnv, resolveAppEnv } from '@hansapi/common';

import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/http-error.filter';
import { StripNullInterceptor } from './common/interceptors/strip-null.interceptor';
import {
  OPENAPI_JSON_PATH,
  SWAGGER_PATH,
  buildOpenApiDocument,
} from './swagger';

// --version 이면 버전만 찍고 끝낸다. 서버를 띄우지 않는다.
// 반드시 loadEnv 앞이다. 버전을 물어보는 데 DB 접속정보까지 갖춰져 있어야 할 이유가 없다.
exitIfVersionFlag(__dirname);

// 환경 설정을 로드한다. backend/config/<환경>/<환경>.env 를 APP_ENV 로 고른다.
// env 파일은 특정 앱이 소유하지 않는다. server·cli 가 같은 DB 를 보므로 접속정보를 중복시키지 않는다.
// 설정을 계층으로 쌓아 EnvSource 로 만든다. 어떤 키가 필수인지는 각 계층이 판단한다.
const envSource = loadEnv(__dirname, resolveAppEnv(), config);

async function bootstrap() {
  const app = await NestFactory.create(AppModule.forRoot(envSource));

  // refresh token 은 httpOnly 쿠키로 오간다. 쿠키 파싱을 켠다(/oauth/token refresh grant 가 읽음).
  app.use(cookieParser());

  // 인증 프론트(plzhans.com 등) 오리진 허용 목록. 로그인/가입은 토큰 없이 호출되므로
  // 'test' 토큰 규칙으로는 통과할 수 없다 — 명시적 allowlist(env, 콤마구분)로 허용한다.
  //   AUTH_ALLOWED_ORIGINS=http://localhost:5173,https://plzhans.com
  const authAllowedOrigins = (envSource.get('AUTH_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // CORS. **인가가 아니라 최소 관문**이다 — 실제 검증(키/클라 status·오리진)은 AuthGuard 가 한다.
  //  - Origin 없음(서버·curl·네이티브): CORS 대상 아님 → 통과
  //  - 1st-party(AUTH_ALLOWED_ORIGINS): 통과 + credentials(refresh 쿠키가 오가야 함)
  //  - 그 외: 인증 헤더를 실을 요청만 통과. 쿠키는 안 준다(credentials 없음 → 타 사이트가
  //          쿠키를 실어 /oauth/token 을 호출해 응답을 읽는 것을 브라우저가 막는다).
  //  프리플라이트는 헤더 "이름"만 예고하므로 access-control-request-headers 를 같이 본다.
  //
  // maxAge: 프리플라이트 응답을 브라우저가 캐시하는 시간(초). X-Client-Id 는 커스텀 헤더라
  // GET 이어도 매번 프리플라이트가 붙는데, 기본 캐시가 아주 짧아(크롬 5초) 호출마다 왕복이 2배가 된다.
  // 10분으로 두면 그 구간 동안 프리플라이트를 건너뛴다(정책을 바꿔도 최대 10분 뒤 반영된다는 뜻).
  const CORS_MAX_AGE_SEC = 600;

  app.enableCors(
    (
      req: Request,
      callback: (err: Error | null, options: CorsOptions) => void,
    ) => {
      const origin = req.headers.origin;
      if (!origin) {
        callback(null, { origin: true, maxAge: CORS_MAX_AGE_SEC });
        return;
      }

      if (authAllowedOrigins.includes(origin)) {
        callback(null, {
          origin,
          credentials: true,
          maxAge: CORS_MAX_AGE_SEC,
        });
        return;
      }

      const asked = String(req.headers['access-control-request-headers'] ?? '');
      const hasAuthKey =
        /x-client-id|authorization/i.test(asked) ||
        !!req.headers['x-client-id'] ||
        !!req.headers.authorization;

      callback(null, {
        origin: hasAuthKey ? origin : false,
        maxAge: CORS_MAX_AGE_SEC,
      });
    },
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 응답에서 값이 없는(null) 프로퍼티를 제거한다(스프링 non_null 정책과 통일).
  app.useGlobalInterceptors(new StripNullInterceptor());
  // 전역 예외 필터. 브라우저 페이지 이동(Accept: text/html)엔 HTML 에러 페이지를,
  // SPA fetch 엔 기존 JSON 을 응답한다(소셜 로그인 콜백이 주소창에 JSON 을 노출하지 않게).
  app.useGlobalFilters(new HttpErrorFilter());

  // APP_ENV 가 'production' 이 아닐 때만 Swagger 문서를 노출한다.
  const swaggerEnabled = envSource.env !== 'production';
  if (swaggerEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      // OpenAPI JSON 스펙을 /openapi.json 으로 서빙 (스프링 springdoc 구조와 통일)
      jsonDocumentUrl: OPENAPI_JSON_PATH,
      // Swagger UI 상단 탐색바를 켜서 openapi.json 스펙 경로를 UI 에 노출한다.
      explorer: true,
      swaggerOptions: {
        url: `/${OPENAPI_JSON_PATH}`,
      },
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  // 부팅 완료 후 접속 링크를 출력한다.
  const logger = new Logger('Bootstrap');
  // getUrl 은 IPv6(::1) 형태를 반환할 수 있어 localhost 기준 링크로 구성한다.
  const baseUrl = `http://127.0.0.1:${port}`;
  logger.log(`🚀 Server is running on ${baseUrl}`);
  if (swaggerEnabled) {
    // OpenAPI(JSON) 스펙 경로(/docs-json)는 Swagger UI 가 내부적으로 로드·노출하므로
    // 부팅 로그에는 사람이 접속하는 Swagger UI 링크만 남긴다.
    logger.log(`📚 Swagger UI: ${baseUrl}/${SWAGGER_PATH}`);
  } else {
    // production 에서는 Swagger 를 노출하지 않는다.
    logger.log('📚 Swagger is disabled in production');
  }
}
bootstrap().catch((error) => {
  new Logger('Bootstrap').error('❌ Failed to start application', error);
  process.exit(1);
});
