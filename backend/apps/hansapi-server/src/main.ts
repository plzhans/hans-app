import { Logger, ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { config } from 'dotenv';
import type { Request } from 'express';
import { loadEnv, resolveAppEnv } from '@hansapi/common';

// SDK 가 실어보내는 임시 공개 토큰. 이 값이면 요청 origin 을 그대로 반사한다.
// TODO: 실제 발급되는 public/user 토큰 체계로 대체.
const PUBLIC_TEST_TOKEN = 'test';
import { AppModule } from './app.module';
import { StripNullInterceptor } from './common/interceptors/strip-null.interceptor';
import {
  OPENAPI_JSON_PATH,
  SWAGGER_PATH,
  buildOpenApiDocument,
} from './swagger';

// 환경 설정을 로드한다. backend/env/.env.<환경> 을 APP_ENV 로 고른다.
// env 파일은 특정 앱이 소유하지 않는다. server·cli 가 같은 DB 를 보므로 접속정보를 중복시키지 않는다.
// 설정을 계층으로 쌓아 EnvSource 로 만든다. 어떤 키가 필수인지는 각 계층이 판단한다.
const envSource = loadEnv(__dirname, resolveAppEnv(), config);

async function bootstrap() {
  const app = await NestFactory.create(AppModule.forRoot(envSource));

  // CORS: SDK 가 실어보내는 Bearer 토큰으로 허용 origin 을 동적으로 판별한다.
  //  - 지금:  토큰이 'test' 이면 요청 origin 을 그대로 반사(허용)한다.
  //  - 나중:  토큰에서 app(project) id 를 추출해, 그 앱에 등록된 origin 목록과
  //          대조하도록 실제-요청 분기를 교체한다.
  //
  // 주의) CORS preflight(OPTIONS)에는 브라우저가 Authorization 헤더를 싣지 않는다.
  //       preflight 단계에선 토큰을 볼 수 없으므로 일단 origin 을 반사해 통과시키고,
  //       실제 토큰↔origin 검증은 이후 가드(실제 요청 단계)에서 수행한다.
  app.enableCors(
    (
      req: Request,
      callback: (err: Error | null, options: CorsOptions) => void,
    ) => {
      const requestOrigin = req.headers.origin;

      // 브라우저 요청이 아니면(Origin 없음: 서버/curl 등) CORS 제약 대상이 아니다.
      if (!requestOrigin) {
        callback(null, { origin: true });
        return;
      }

      const token = (req.headers.authorization ?? '')
        .replace(/^Bearer\s+/i, '')
        .trim();
      const isPreflight = req.method === 'OPTIONS';

      // preflight 는 토큰이 없어 판별 불가 → 반사해 통과(실제 검증은 가드에서).
      // 실제 요청은 지금은 test 토큰일 때만 반사한다.
      // TODO: token -> appId 추출 후, 앱에 등록된 origin 목록과 대조하도록 교체.
      const allowed = isPreflight || token === PUBLIC_TEST_TOKEN;

      callback(null, { origin: allowed ? requestOrigin : false });
    },
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 응답에서 값이 없는(null) 프로퍼티를 제거한다(스프링 non_null 정책과 통일).
  app.useGlobalInterceptors(new StripNullInterceptor());

  // NODE_ENV 가 'production' 이 아닐 때만 Swagger 문서를 노출한다.
  const swaggerEnabled = process.env.NODE_ENV !== 'production';
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
