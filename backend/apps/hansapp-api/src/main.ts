// ⚠️ **이 import 가 항상 첫 줄이어야 한다.** Sentry 는 http·express 를 monkey-patch 해서 요청을
// 추적하는데, 그 모듈이 Sentry.init 보다 먼저 require 되면 조용히 아무것도 계측되지 않는다.
// instrument 가 부팅 설정(boot-config)을 읽고 Sentry.init 까지 끝낸다.
import { sentryStatusLine } from './instrument';

import { existsSync, readFileSync } from 'node:fs';

import { Logger, ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import { logConfigSummary, resolveConfigPath } from '@hansapp/common';
import { isFirstPartyOrigin, normalizeRootDomain } from '@hansapp/auth-application';
import { HealthService, SlackNotifyService, SwaggerAccessService } from '@hansapp/application';
import { HttpErrorFilter, StripNullInterceptor, requestIdMiddleware } from '@hansapp/http-common';

import { AppModule } from './app.module';
import { appConfig, appEnv } from './boot-config';
import { buildInfo } from './build-info';
import { initRefreshCookie } from './auth/refresh-cookie';
import { createSwaggerAccessMiddleware } from './common/swagger-access.middleware';
import { OPENAPI_JSON_PATH, SWAGGER_PATH, buildOpenApiDocument } from './swagger';

// --version 처리, 환경 판별, 설정(ConfigSource) 로딩은 boot-config.ts 가 한다.
// Sentry.init 이 DSN·환경·버전을 먼저 알아야 해서 모든 import 보다 앞서 돌아야 하기 때문이다.

// 요청마다 도는 유틸(refresh-cookie)이 쓸 값을 부팅 시점에 한 번 읽어 고정한다.
initRefreshCookie(appConfig, appEnv);

/**
 * Express 'trust proxy' 설정을 env 에서 파싱한다.
 * 프록시(nginx/LB/CDN) 뒤에 있을 때만 켠다 — req.ip 와 rate limit 이 X-Forwarded-For 의
 * 실제 클라이언트 IP 를 쓰게 한다. 무조건 켜면 XFF 위조로 IP 기반 한도를 우회당하므로
 * 반드시 env 로 명시한다(미설정 시 끔 = 소켓 IP 사용).
 *   TRUST_PROXY=1            신뢰 프록시 홉 수(권장: 앞단 프록시 개수)
 *   TRUST_PROXY=10.0.0.0/8   신뢰할 프록시 IP/서브넷(콤마 구분) 또는 'loopback' 등 프리셋
 *   TRUST_PROXY=true|false
 */
function parseTrustProxy(raw?: string): boolean | number | string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

/**
 * TLS 설정을 읽는다. 이름은 nginx 의 ssl_certificate / ssl_certificate_key 와 맞췄다.
 *
 * **둘 다 있으면 HTTPS, 둘 다 없으면 HTTP.** 켜고 끄는 별도 플래그를 두지 않는다 —
 * 플래그와 경로가 어긋나는 상태(켜져 있는데 경로가 없다)를 아예 만들지 않기 위해서다.
 *
 * 앞단이 TLS 를 끝내는 구성(nginx·cloudflared tunnel·LB)에서는 설정을 비우면 되고,
 * 이 코드는 그대로다. 인프라 교체가 설정 두 줄로 끝나는 이유가 여기 있다.
 */
function readHttpsOptions() {
  // 빈 문자열·공백뿐인 값은 **없는 것으로 본다** — yaml 에 키만 남겨 두거나
  // SSL_CERTIFICATE= 로 비우는 건 '끄겠다'는 뜻이지 경로가 아니다.
  // getStringOrDefault 가 그렇게 정규화하지만, 여기서 스킴이 갈리므로
  // 판단 기준을 이 자리에 드러내 둔다.
  const cert = appConfig.getStringOrDefault('apps-api.web.sslCertificate');
  const key = appConfig.getStringOrDefault('apps-api.web.sslCertificateKey');
  const hasCert = cert.length > 0;
  const hasKey = key.length > 0;

  // 한쪽만 설정된 건 설정 실수다. 조용히 HTTP 로 떨어뜨리면 운영이 평문으로 뜬다.
  if (hasCert !== hasKey) {
    throw new Error(
      'apps-api.web.sslCertificate 와 sslCertificateKey 는 둘 다 설정하거나 둘 다 비워야 한다',
    );
  }
  if (!hasCert) return undefined;

  return {
    cert: readCertFile('apps-api.web.sslCertificate', cert),
    key: readCertFile('apps-api.web.sslCertificateKey', key),
  };
}

/**
 * 인증서 파일을 읽는다. 경로만 있고 파일이 없으면 **부팅을 멈춘다** —
 * 평문으로 뜨는 것보다 안 뜨는 게 낫다.
 *
 * 상대경로는 설정이 선언된 자리(워크스페이스 루트) 기준으로도 찾는다. cwd 만 보면
 * 하위 디렉터리에서 띄웠을 때 yaml 은 읽히는데 인증서만 안 잡힌다.
 *
 * readFileSync 의 ENOENT 를 그대로 두지 않는 이유는 **어느 설정 값 때문인지**와
 * 상대경로가 어디로 풀렸는지가 메시지에 없어서다. 그게 없으면 띄운 위치가 문제인지
 * 경로 오타인지를 로그만 보고는 못 가린다.
 */
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
 * 의존 인프라 접속을 확인하고, **하나라도 실패하면 던져서 부팅을 중단한다.**
 *
 * 점검 자체(무엇을 어떻게 찔러 보는지)는 응용 계층(HealthService)이 하고, 여기서는
 * **그 결과로 뜰지 말지를 정한다** — 서버는 다 붙어야 뜨지만 CLI 는 ES 가 죽어 있어도
 * 돌아야 하는 것처럼, 무엇이 치명적인지는 실행 주체마다 다르기 때문이다.
 *
 * 실패해도 결과를 전부 찍는다. 첫 실패에서 멈추면 재시작을 세 번 해야 문제 세 개를 안다.
 */
async function verifyInfrastructure(app: NestExpressApplication, logger: Logger): Promise<void> {
  const results = await app.get(HealthService).checkAll();
  for (const { name, status, reason } of results) {
    const line = `${name}: ${status}${reason ? ` — ${reason}` : ''}`;
    if (status === 'failed') {
      logger.error(`❌ ${line}`);
    } else if (status === 'skipped') {
      logger.warn(`⚠️ ${line}`);
    } else {
      logger.log(`✅ ${line}`);
    }
  }

  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    throw new Error(`인프라 접속 실패: ${failed.map((r) => r.name).join(', ')}`);
  }
}

async function bootstrap() {
  const httpsOptions = readHttpsOptions();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(appConfig),
    httpsOptions ? { httpsOptions } : {},
  );

  // 프록시 뒤라면 실제 클라 IP 를 인식하도록 trust proxy 를 켠다(rate limit 정확도).
  // yaml(config/config.yaml) 기본값 또는 TRUST_PROXY 환경변수로 켠다(env 가 이긴다).
  const trustProxy = parseTrustProxy(
    appConfig.getStringOrDefault('apps-api.proxy.trust') || undefined,
  );
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  // 추적 id. **가장 앞에 세운다** — 뒤에 오는 모든 것(로그·오류 필터·Sentry)이 이 값을
  // 쓸 수 있어야 하고, 인증에서 튕긴 요청도 추적되어야 하므로 가드보다도 앞이다.
  app.use(requestIdMiddleware);

  // refresh token 은 httpOnly 쿠키로 오간다. 쿠키 파싱을 켠다(/oauth/token refresh grant 가 읽음).
  app.use(cookieParser());

  // 1st-party(자사) 판별 기준 = 서비스 루트 도메인(APP_ROOT_DOMAIN). 자사 오리진은 credentials(쿠키)를
  // 허용한다. 별도 오리진 목록을 두지 않는다 — rootDomain 범위(자신·서브도메인)면 자사, 미설정(로컬)이면
  // 루프백만 자사. isFirstPartyOrigin 이 소셜 가드·FirstPartyGuard·토큰 서비스와 동일 규칙을 공유한다.
  const rootDomain = normalizeRootDomain(appConfig.getStringOrDefault('auth.rootDomain'));

  // CORS. **인가가 아니라 최소 관문**이다 — 실제 검증(키/클라 status·오리진)은 AuthGuard 가 한다.
  //  - Origin 없음(서버·curl·네이티브): CORS 대상 아님 → 통과
  //  - 1st-party(APP_ROOT_DOMAIN 범위): 통과 + credentials(refresh 쿠키가 오가야 함)
  //  - 그 외: 인증 헤더를 실을 요청만 통과. 쿠키는 안 준다(credentials 없음 → 타 사이트가
  //          쿠키를 실어 /oauth/token 을 호출해 응답을 읽는 것을 브라우저가 막는다).
  //  프리플라이트는 헤더 "이름"만 예고하므로 access-control-request-headers 를 같이 본다.
  //
  // maxAge: 프리플라이트 응답을 브라우저가 캐시하는 시간(초). X-Client-Id 는 커스텀 헤더라
  // GET 이어도 매번 프리플라이트가 붙는데, 기본 캐시가 아주 짧아(크롬 5초) 호출마다 왕복이 2배가 된다.
  // 10분으로 두면 그 구간 동안 프리플라이트를 건너뛴다(정책을 바꿔도 최대 10분 뒤 반영된다는 뜻).
  const CORS_MAX_AGE_SEC = 600;

  app.enableCors((req: Request, callback: (err: Error | null, options: CorsOptions) => void) => {
    // OIDC discovery·JWKS 는 **누구나 읽으라고 내놓은 공개 문서**다. 외부 앱은 이걸 읽어야
    // 로그인 주소와 토큰 검증 공개키를 알 수 있는데, 자격증명을 실을 수 없는 요청이라
    // 아래 규칙(인증 헤더가 있어야 통과)에 걸려 브라우저가 응답을 버렸다.
    // 비밀이 아닌 값이고 쿠키도 주지 않으므로 오리진을 가리지 않는다.
    //
    // **요청 Origin 을 되비추지 않고 `*` 로 준다.** 되비추면 응답이 Origin 마다 달라져
    // `Vary: Origin` 이 붙고, 공용 캐시가 오리진 수만큼 사본을 따로 들게 된다.
    // 이 두 문서는 누가 요청하든 같은 값이라 사본 하나로 충분하다(컨트롤러가 한 시간 캐시).
    // 그래서 Origin 유무를 보기 **전에** 먼저 가른다 — 헤더 없는 요청까지 같은 응답이어야 한다.
    if (req.path.startsWith('/.well-known/')) {
      callback(null, { origin: '*', maxAge: CORS_MAX_AGE_SEC });
      return;
    }

    const origin = req.headers.origin;
    if (!origin) {
      callback(null, { origin: true, maxAge: CORS_MAX_AGE_SEC });
      return;
    }

    if (isFirstPartyOrigin(origin, rootDomain)) {
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
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 응답에서 값이 없는(null) 프로퍼티를 제거한다(스프링 non_null 정책과 통일).
  app.useGlobalInterceptors(new StripNullInterceptor());
  // 전역 예외 필터. 브라우저 페이지 이동(Accept: text/html)엔 HTML 에러 페이지를,
  // SPA fetch 엔 기존 JSON 을 응답한다(소셜 로그인 콜백이 주소창에 JSON 을 노출하지 않게).
  app.useGlobalFilters(new HttpErrorFilter());

  // Swagger 문서 노출. **기본은 꺼짐이고, 열 환경이 yaml 에 명시로 켠다**(config-defaults.ts).
  //   local·develop : 켜고 ipRestricted 를 풀어 그대로 공개
  //   production    : 켜되 env_swagger_allowed_ip 에 등록된 IP 만 (아래 미들웨어)
  const swaggerEnabled = appConfig.getBoolOrDefault('apps-api.swagger.enabled');
  // 켠 뒤의 기본은 잠근 쪽이다. 목록을 채워야 열리는 게 불편한 환경이 yaml 에서 푼다.
  const swaggerIpRestricted = appConfig.getBoolOrDefault('apps-api.swagger.ipRestricted');

  if (swaggerEnabled) {
    if (swaggerIpRestricted) {
      // ⚠️ **SwaggerModule.setup 보다 먼저** 등록해야 한다. setup 은 Express 핸들러를 직접
      // 붙이므로 나중에 걸면 문서가 먼저 응답하고 이 미들웨어는 지나간다.
      app.use(
        createSwaggerAccessMiddleware({
          service: app.get(SwaggerAccessService),
          // rate limit 과 같은 헤더를 쓴다(production: cf-connecting-ip). 판정 기준이
          // 두 군데서 갈리면 "왜 한쪽만 막히지" 가 된다.
          clientIpHeader:
            appConfig.getStringOrDefault('apps-api.proxy.clientIpHeader') || undefined,
        }),
      );
    }

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

  // 종료 신호(SIGTERM·SIGINT)를 Nest 가 받아 onModuleDestroy·onApplicationShutdown 을
  // **기다린 뒤** 프로세스를 내린다. 이걸 켜지 않으면 신호가 그대로 프로세스를 죽여
  // 종료 훅이 아예 돌지 않는다 — 슬랙 종료 알림이 그 훅에 얹혀 있다.
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  // 접속 대상·활성 provider 요약(시크릿 마스킹, 한 줄씩). listen 앞에 둬 포트 충돌 등으로 못 떠도 설정은 보이게 한다.
  logConfigSummary(appConfig, (l) => logger.log(l));
  // Sentry 가 켜졌는지도 같이 남긴다. 조용히 꺼져 있는 게 최악이다.
  logger.log(sentryStatusLine);

  // 슬랙 알림도 같은 이유로 남긴다. 켜졌는지뿐 아니라 **어떤 수단으로 보내는지** 까지
  // 적는다 — 웹훅으로 떨어지면 종료 알림이 스레드로 안 달리는데, 그 이유가 로그에 없으면
  // 슬랙만 보고는 설정이 잘못됐는지 원래 그런지를 알 수 없다.
  const slackNotify = app.get(SlackNotifyService);
  logger.log(slackNotify.statusLine);

  // 인프라(MySQL·Redis·ES)에 못 붙으면 **리슨 전에** 죽는다. 반쯤 죽은 채 뜨면 포트는
  // 열려 있어 앞단은 정상으로 보고 요청마다 500 이 난다.
  //
  // **재시도하지 않는다.** 배포에서는 컨테이너가 재시작되며 인프라가 뜨기를 기다리므로
  // 여기서 또 기다리면 같은 일을 두 겹으로 하는 것이다 — 죽는 게 곧 재시도다.
  await verifyInfrastructure(app, logger);

  const port = appConfig.getNumberOrDefault('apps-api.web.port');
  await app.listen(port);

  // 부팅 완료 후 접속 링크를 출력한다. getUrl 은 IPv6(::1)일 수 있어 localhost 기준으로 구성한다.
  const baseUrl = `${httpsOptions ? 'https' : 'http'}://127.0.0.1:${port}`;
  logger.log(`🚀 Server is running on ${baseUrl}`);
  if (swaggerEnabled) {
    // OpenAPI(JSON) 스펙 경로는 Swagger UI 가 내부적으로 로드·노출하므로
    // 부팅 로그에는 사람이 접속하는 Swagger UI 링크만 남긴다.
    //
    // IP 제한이 걸렸는지도 같이 남긴다. **조용히 열려 있는 게 최악이다** — 로그에
    // 링크만 있으면 제한이 꺼진 채 뜬 것을 아무도 눈치채지 못한다.
    logger.log(
      `📚 Swagger UI: ${baseUrl}/${SWAGGER_PATH}${
        swaggerIpRestricted ? ' (IP restricted — env_swagger_allowed_ip)' : ' (open to everyone)'
      }`,
    );
  } else {
    logger.log('📚 Swagger is disabled by config (apps-api.swagger.enabled)');
  }

  // 부팅 시퀀스의 **마지막 라인** — 여기까지 찍혔으면 요청을 받을 준비가 끝났다는 신호다.
  // 위 로그들이 중간에 끊기면 준비 전에 죽은 것이므로, 이 한 줄을 준비 완료의 기준으로 삼는다.
  logger.log(`✅ ${appConfig.env} 서버 부팅 완료 — ${baseUrl} (pid ${process.pid})`);

  // 슬랙 알림은 부팅 완료 로그 **뒤에** 보낸다. 준비가 끝났다고 알리는 메시지이므로
  // 그 판정 기준이 되는 로그보다 앞설 이유가 없고, 슬랙이 느려도 부팅 로그는 제때 찍힌다.
  // 실패는 서비스가 안에서 삼킨다 — 알림 때문에 뜬 서버를 내리지 않는다.
  await slackNotify.notifyServerStarted({
    name: 'hansapp-api',
    environment: appConfig.env,
    version: buildInfo().version,
  });
}
bootstrap().catch((error) => {
  new Logger('Bootstrap').error('❌ Failed to start application', error);
  process.exit(1);
});
