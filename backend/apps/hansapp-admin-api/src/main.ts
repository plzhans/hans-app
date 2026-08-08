// ⚠️ **이 import 가 항상 첫 줄이어야 한다.** Sentry 는 http·express 를 monkey-patch 해서 요청을
// 추적하는데, 그 모듈이 Sentry.init 보다 먼저 require 되면 조용히 아무것도 계측되지 않는다.
// instrument 가 부팅 설정(boot-config)을 읽고 Sentry.init 까지 끝낸다.
import { sentryStatusLine } from './instrument';

import { existsSync, readFileSync } from 'node:fs';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { logConfigSummary, resolveConfigPath } from '@hansapp/common';
import { HealthService } from '@hansapp/admin-application';
import {
  HttpErrorFilter,
  StripNullInterceptor,
  requestIdMiddleware,
} from '@hansapp/http-common';

import { AppModule } from './app.module';
import { appConfig, appEnv } from './boot-config';
import { buildInfo } from './build-info';
import { initAdminCookie } from './auth/admin-cookie';
import {
  OPENAPI_JSON_PATH,
  SWAGGER_PATH,
  buildOpenApiDocument,
} from './swagger';

// --version 처리, 환경 판별, 설정(ConfigSource) 로딩은 boot-config.ts 가 한다.

// 요청마다 도는 유틸(admin-cookie)이 쓸 값을 부팅 시점에 한 번 읽어 고정한다.
initAdminCookie(appConfig, appEnv);

/** hansapp-api 와 같은 규칙. 프록시 뒤일 때만 켠다(XFF 위조로 IP 한도를 우회당하지 않게). */
function parseTrustProxy(raw?: string): boolean | number | string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

/**
 * TLS 설정. **둘 다 있으면 HTTPS, 둘 다 없으면 HTTP.** 별도 on/off 플래그를 두지 않는다 —
 * 플래그와 경로가 어긋나는 상태를 아예 만들지 않기 위해서다.
 */
function readHttpsOptions() {
  const cert = appConfig.getStringOrDefault(
    'apps-admin-api.web.sslCertificate',
  );
  const key = appConfig.getStringOrDefault(
    'apps-admin-api.web.sslCertificateKey',
  );
  const hasCert = cert.length > 0;
  const hasKey = key.length > 0;

  // 한쪽만 설정된 건 설정 실수다. 조용히 HTTP 로 떨어뜨리면 관리자 화면이 평문으로 뜬다.
  if (hasCert !== hasKey) {
    throw new Error(
      'apps-admin-api.web.sslCertificate 와 sslCertificateKey 는 둘 다 설정하거나 둘 다 비워야 한다',
    );
  }
  if (!hasCert) return undefined;

  return {
    cert: readCertFile('apps-admin-api.web.sslCertificate', cert),
    key: readCertFile('apps-admin-api.web.sslCertificateKey', key),
  };
}

function readCertFile(configPath: string, value: string): Buffer {
  const resolved = resolveConfigPath(__dirname, value);
  if (!existsSync(resolved)) {
    throw new Error(
      `${configPath} 가 가리키는 파일이 없다: ${value} (resolved: ${resolved}, cwd: ${process.cwd()})`,
    );
  }
  return readFileSync(resolved);
}

/**
 * 의존 인프라 접속을 확인한다.
 *
 * **MySQL 만 치명적으로 본다.** 관리자 API 가 하는 일은 대부분 DB 조회이고, Elasticsearch·Redis 는
 * 색인 작업 같은 일부 기능에서만 쓴다. 그것 때문에 관리자 화면 전체가 안 뜨면 오히려 곤란하다 —
 * ES 가 죽었을 때 들어가서 상태를 봐야 하는 곳이 여기다.
 */
async function verifyInfrastructure(
  app: NestExpressApplication,
  logger: Logger,
): Promise<void> {
  const results = await app.get(HealthService).checkAll();
  const fatal: string[] = [];

  for (const { name, status, reason } of results) {
    const line = `${name}: ${status}${reason ? ` — ${reason}` : ''}`;
    if (status === 'failed') {
      const isDatabase = name.toLowerCase().includes('mysql');
      if (isDatabase) {
        logger.error(`❌ ${line}`);
        fatal.push(name);
      } else {
        logger.warn(`⚠️ ${line} (관리자 API 는 이것 없이도 뜬다)`);
      }
    } else if (status === 'skipped') {
      logger.warn(`⚠️ ${line}`);
    } else {
      logger.log(`✅ ${line}`);
    }
  }

  if (fatal.length > 0) {
    throw new Error(`인프라 접속 실패: ${fatal.join(', ')}`);
  }
}

async function bootstrap() {
  const httpsOptions = readHttpsOptions();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(appConfig),
    httpsOptions ? { httpsOptions } : {},
  );

  const trustProxy = parseTrustProxy(
    appConfig.getStringOrDefault('apps-admin-api.proxy.trust') || undefined,
  );
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  // 추적 id. **가장 앞에 세운다** — 인증에서 튕긴 요청도 추적되어야 하므로 가드보다도 앞이다.
  app.use(requestIdMiddleware);

  // refresh token 은 httpOnly 쿠키로 오간다.
  app.use(cookieParser());

  /*
    **CORS 를 기본으로 켜지 않는다.**

    관리자 SPA 는 admin API 와 같은 오리진에서 뜬다 — 같은 오리진이면 CORS 자체가 걸리지 않고,
    켜 두면 열어 줄 이유가 없는 문만 하나 여는 셈이다. 로컬에서 Vite dev server 를 다른 포트로
    띄울 때만 `apps-admin-api.cors.origins` 에 그 오리진을 적어 켠다(운영 yaml 에서는 비운다).
  */
  const corsOrigins = appConfig.getStringArray('apps-admin-api.cors.origins');
  if (corsOrigins.length > 0) {
    // getStringArray 는 readonly 를 준다. cors 옵션은 가변 배열을 요구하므로 복사해 넘긴다.
    app.enableCors({ origin: [...corsOrigins], credentials: true });
  }
  /*
    **켜졌는지 로그로 남긴다.** 꺼져 있으면 브라우저 콘솔에만 CORS 오류가 뜨고 서버 로그는
    조용하다 — 서버가 요청을 정상 처리했기 때문이다(막는 것은 브라우저다). 그래서 어느 쪽이
    문제인지 한참 헤매게 된다. 실제로 develop 설정(목록이 빈다)으로 띄워 놓고 로컬 프론트로
    붙었을 때 그랬다.
  */
  const corsStatusLine =
    corsOrigins.length > 0
      ? `🌐 CORS   : ${corsOrigins.join(', ')}`
      : '🌐 CORS   : 꺼짐 — apps-admin-api.cors.origins 가 비었다 ' +
        '(같은 오리진 배포면 정상. 다른 포트의 프론트에서 부르면 브라우저가 막는다)';

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new StripNullInterceptor());
  app.useGlobalFilters(new HttpErrorFilter());

  /*
    Swagger. **기본은 꺼짐이고, 열 환경이 yaml 에 명시로 켠다**(config-defaults.ts).

    hansapp-api 가 운영에서도 문서를 여는 것은 외부 개발자가 스펙을 소비하기 때문이고, 그래서
    IP 화이트리스트가 필요했다. 관리자 API 는 외부 소비자가 없다 — 열어 둘 이유가 없으니
    IP 제한 장치도 얹지 않는다.
  */
  const swaggerEnabled = appConfig.getBoolOrDefault(
    'apps-admin-api.swagger.enabled',
  );
  if (swaggerEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      jsonDocumentUrl: OPENAPI_JSON_PATH,
      explorer: true,
      swaggerOptions: { url: `/${OPENAPI_JSON_PATH}` },
    });
  }

  // 종료 신호를 Nest 가 받아 종료 훅을 기다린 뒤 프로세스를 내린다.
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  logConfigSummary(appConfig, (l) => logger.log(l));
  logger.log(corsStatusLine);
  logger.log(sentryStatusLine);

  // DB 에 못 붙으면 **리슨 전에** 죽는다. 반쯤 죽은 채 뜨면 포트는 열려 있어 앞단은
  // 정상으로 보고 요청마다 500 이 난다.
  await verifyInfrastructure(app, logger);

  // 기본 포트가 3001 인 이유는 3000 을 hansapp-api 가 쓰기 때문이다(로컬에서 같이 띄운다).
  const port = appConfig.getNumberOrDefault('apps-admin-api.web.port');
  await app.listen(port);

  const baseUrl = `${httpsOptions ? 'https' : 'http'}://127.0.0.1:${port}`;
  logger.log(`🚀 Admin API is running on ${baseUrl}`);
  if (swaggerEnabled) {
    logger.log(`📚 Swagger UI: ${baseUrl}/${SWAGGER_PATH}`);
  } else {
    logger.log(
      '📚 Swagger is disabled by config (apps-admin-api.swagger.enabled)',
    );
  }

  // 부팅 시퀀스의 **마지막 라인** — 여기까지 찍혔으면 요청을 받을 준비가 끝났다는 신호다.
  logger.log(
    `✅ ${appConfig.env} 관리자 API 부팅 완료 — ${baseUrl} (pid ${process.pid}, v${buildInfo().version})`,
  );
}
bootstrap().catch((error) => {
  new Logger('Bootstrap').error('❌ Failed to start admin API', error);
  process.exit(1);
});
