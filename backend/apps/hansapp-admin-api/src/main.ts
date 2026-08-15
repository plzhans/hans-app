// ⚠️ **이 import 가 항상 첫 줄이어야 한다.** Sentry 는 http·express 를 monkey-patch 해서 요청을
// 추적하는데, 그 모듈이 Sentry.init 보다 먼저 require 되면 조용히 아무것도 계측되지 않는다.
// instrument 가 부팅 설정(boot-config)을 읽고 Sentry.init 까지 끝낸다.
import { sentryEnabled, sentryStatusLine } from './instrument';

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
  adminSwaggerTagsSorter,
  reportBootFailure,
} from '@hansapp/http-common';

import { AppModule } from './app.module';
import { appConfig, appEnv } from './boot-config';
import { buildInfo } from './build-info';
import { initAdminCookie } from './auth/admin-cookie';
import { initAdminSocial } from './auth/admin-social-flow';
import { isAdminSpaServed, serveAdminSpa } from './static-spa';
import { OPENAPI_JSON_PATH, SWAGGER_PATH, buildOpenApiDocument } from './swagger';

// --version 처리, 환경 판별, 설정(ConfigSource) 로딩은 boot-config.ts 가 한다.

// 요청마다 도는 유틸(admin-cookie)이 쓸 값을 부팅 시점에 한 번 읽어 고정한다.
initAdminCookie(appConfig, appEnv);
// 소셜 흐름이 쓸 값(콘솔 주소·쿠키 secure)도 같은 이유로 여기서 굳힌다.
initAdminSocial(appConfig);

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
  const cert = appConfig.getStringOrDefault('apps-admin-api.web.sslCertificate');
  const key = appConfig.getStringOrDefault('apps-admin-api.web.sslCertificateKey');
  const hasCert = cert.length > 0;
  const hasKey = key.length > 0;

  // 한쪽만 설정된 건 설정 실수다. 조용히 HTTP 로 떨어뜨리면 관리자 화면이 평문으로 뜬다.
  if (hasCert !== hasKey) {
    throw new Error(
      'apps-admin-api.web.sslCertificate and sslCertificateKey must both be set or both be empty.',
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
      `${configPath} points to a missing file: ${value} ` +
        `(resolved: ${resolved}, cwd: ${process.cwd()})`,
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
async function verifyInfrastructure(app: NestExpressApplication, logger: Logger): Promise<void> {
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
        logger.warn(`⚠️ ${line} (the admin API starts without it)`);
      }
    } else if (status === 'skipped') {
      logger.warn(`⚠️ ${line}`);
    } else {
      logger.log(`✅ ${line}`);
    }
  }

  if (fatal.length > 0) {
    throw new Error(`Infrastructure check failed: ${fatal.join(', ')}`);
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

    **비었다는 사실만으로는 정상인지 사고인지 못 가른다.** 가르는 것은 화면이 어디 있느냐다 —
    SPA 를 이 서버가 같이 내보내면 같은 오리진이라 CORS 는 아예 필요가 없고, 안 내보내면
    화면이 다른 곳에 있다는 뜻이라 그때만 걱정할 일이다. 그래서 문구를 셋으로 나눈다.
    한 줄에 두 상황을 같이 적어 두면 정상 배포에서도 경고문으로 읽힌다.
  */
  const corsStatusLine =
    corsOrigins.length > 0
      ? `🌐 CORS   : ${corsOrigins.join(', ')}`
      : isAdminSpaServed(appConfig)
        ? '🌐 CORS   : not needed — the admin SPA is served from the same origin'
        : '🌐 CORS   : off — if the console is served from another origin, the browser will block it ' +
          '(list that origin in apps-admin-api.cors.origins)';

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new StripNullInterceptor());
  // 오류가 밖으로 나가는 유일한 문. 상태 코드 변환·로그·Sentry 보고가 여기서 한 번씩 지난다.
  app.useGlobalFilters(
    new HttpErrorFilter({ debug: appConfig.getBoolOrDefault('apps-admin-api.error.debug') }),
  );

  /*
    Swagger. **기본은 꺼짐이고, 열 환경이 yaml 에 명시로 켠다**(config-defaults.ts).

    hansapp-api 가 운영에서도 문서를 여는 것은 외부 개발자가 스펙을 소비하기 때문이고, 그래서
    IP 화이트리스트가 필요했다. 관리자 API 는 외부 소비자가 없다 — 열어 둘 이유가 없으니
    IP 제한 장치도 얹지 않는다.
  */
  const swaggerEnabled = appConfig.getBoolOrDefault('apps-admin-api.swagger.enabled');
  if (swaggerEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      jsonDocumentUrl: OPENAPI_JSON_PATH,
      explorer: true,
      swaggerOptions: {
        url: `/${OPENAPI_JSON_PATH}`,
        // 섹션 순서. 이 함수는 브라우저로 실려 나간다(자기 완결이어야 한다 — 정의부 주석 참고).
        tagsSorter: adminSwaggerTagsSorter,
      },
    });
  }

  /*
    관리자 SPA. **컨트롤러가 다 선 뒤에 붙는다** — 그래야 /api·/auth 를 라우터가 먼저
    가져가고 남는 것만 정적파일로 간다.
  */
  const spaStatusLine = serveAdminSpa(app, appConfig);

  // 종료 신호를 Nest 가 받아 종료 훅을 기다린 뒤 프로세스를 내린다.
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  logConfigSummary(appConfig, (l) => logger.log(l));
  logger.log(corsStatusLine);
  logger.log(spaStatusLine);
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
    logger.log('📚 Swagger is disabled by config (apps-admin-api.swagger.enabled)');
  }

  // 부팅 시퀀스의 **마지막 라인** — 여기까지 찍혔으면 요청을 받을 준비가 끝났다는 신호다.
  logger.log(
    `✅ ${appConfig.env} admin API started — ${baseUrl} (pid ${process.pid}, v${buildInfo().version})`,
  );
}
/*
  **부팅에서 죽으면 Sentry 로 알린다.** 요청 오류는 전역 예외 필터가 보고하지만, 부팅 실패는
  그 필터가 서기도 전이라 아무도 안 알린다 — CI 로 배포되는 서비스에서는 컨테이너가 재시작을
  반복하는 것을 누가 로그를 열어 보기 전까지 모르게 된다.

  **보고를 기다린 뒤에 죽는다.** 전송이 비동기라 곧바로 exit 하면 이벤트가 큐에 담긴 채로
  사라진다 — 보고한 줄 알았는데 아무것도 안 가는 것이 제일 나쁘다.
*/
bootstrap().catch(async (error) => {
  new Logger('Bootstrap').error('❌ Failed to start admin API', error);
  await reportBootFailure(error, sentryEnabled);
  process.exit(1);
});
