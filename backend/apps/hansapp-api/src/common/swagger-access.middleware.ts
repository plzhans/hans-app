import { Logger } from '@nestjs/common';
import type { RequestHandler } from 'express';
import type { SwaggerAccessService } from '@hansapp/application';

import { resolveClientIp } from '@hansapp/http-common';
import { OPENAPI_JSON_PATH, SWAGGER_PATH } from '../swagger';

/**
 * Swagger 문서를 허용된 IP 에서만 보게 하는 앞단 미들웨어.
 *
 * [왜 가드가 아니라 미들웨어인가]
 * SwaggerModule.setup 은 Nest 라우터에 라우트를 등록하지 않고 **Express 핸들러를 직접**
 * 붙인다. 그래서 @UseGuards 든 APP_GUARD(전역 가드)든 /docs 에는 닿지 않는다.
 * 가드로 막았다고 착각하기 쉬운 자리라, 미들웨어로 두고 **setup 호출보다 먼저** 등록한다.
 *
 * [왜 경로를 안에서 판정하는가]
 * app.use('/docs/*', ...) 처럼 경로 패턴으로 마운트하지 않는다. Express 5 에서 와일드카드
 * 문법이 바뀌어(`*` → `*splat`) 같은 코드가 버전에 따라 조용히 안 걸린다. 요청마다 도는
 * 비용은 문자열 비교 세 번이라 그 위험을 살 이유가 없다.
 *
 * [막아야 하는 경로가 셋이다]
 *   /docs              Swagger UI 문서
 *   /docs/*            swagger-ui 정적 자산(swagger-ui-bundle.js 등)
 *   /openapi.json      **스펙 본문**
 * 세 번째가 핵심이다. jsonDocumentUrl 이 루트에 붙어 있어 /docs 접두사로는 잡히지 않는데,
 * UI 만 막고 이걸 열어두면 전체 API 스펙이 그대로 나간다.
 */
export function createSwaggerAccessMiddleware(options: {
  service: SwaggerAccessService;
  /** 진짜 클라 IP 가 담긴 헤더(production: cf-connecting-ip). 미설정이면 req.ip 폴백. */
  clientIpHeader?: string;
}): RequestHandler {
  const { service, clientIpHeader } = options;
  const logger = new Logger('SwaggerAccess');

  const uiPath = `/${SWAGGER_PATH}`;
  const uiPrefix = `${uiPath}/`;
  const specPath = `/${OPENAPI_JSON_PATH}`;

  const isProtected = (path: string): boolean =>
    path === uiPath || path.startsWith(uiPrefix) || path === specPath;

  return (req, res, next) => {
    if (!isProtected(req.path)) {
      next();
      return;
    }

    const clientIp = resolveClientIp(req, clientIpHeader);

    void service
      .isAllowed(clientIp)
      .then((allowed) => {
        if (allowed) {
          next();
          return;
        }
        // 차단은 남긴다 — 허용목록에 IP 를 넣고도 막히는 경우, 서버가 실제로 어떤 IP 로
        // 봤는지가 유일한 단서다. 정상 접근은 남기지 않는다(문서 열 때마다 수십 줄이 된다).
        logger.warn(`Denied ${req.method} ${req.path} from ${clientIp}`);
        res.status(403).json({
          statusCode: 403,
          message: 'Access denied for this IP address',
          error: 'Forbidden',
        });
      })
      .catch((error: unknown) => {
        // 판정 자체가 터진 경우. 열어주지 않는다.
        logger.error(
          `Swagger access check failed for ${clientIp}`,
          error instanceof Error ? error.stack : undefined,
        );
        res.status(403).json({
          statusCode: 403,
          message: 'Access denied for this IP address',
          error: 'Forbidden',
        });
      });
  };
}
