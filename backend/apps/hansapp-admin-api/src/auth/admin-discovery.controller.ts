import { Get, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import type { Response } from 'express';
import { ADMIN_AUTH_CONFIG, AdminPublic } from '@hansapp/admin-application/auth';
import type { AdminAuthConfig } from '@hansapp/admin-application/auth';

import { AdminOpenIdConfigurationDto } from './dto/well-known.dto';

/**
 * 캐시 상한(초). 설정값 하나를 그대로 내보내는 응답이라 서버 비용이 없고,
 * 값이 바뀌면 빨리 따라와야 하므로 짧게 잡는다.
 */
const MAX_AGE_SEC = 60;

/**
 * 관리자 API 의 discovery 문서.
 *
 * **JWKS 는 없다.** 관리자 access token 은 대칭키(HS256)로 서명한다 — 그 토큰을 검증하는 곳이
 * 이 API 하나뿐이라 공개키를 나눠 줄 상대가 없다. 대칭키는 공개하는 순간 서명 키가 유출되므로
 * 어떤 형태로도 싣지 않는다.
 *
 * 그래서 문서에 남는 것은 issuer 뿐이고, 쓰임도 `iss` 를 대조하는 것 하나다.
 * 그래도 공개 API 와 같은 자리에 같은 이름으로 두는 편이 낫다 — 두 API 를 함께 다루는
 * 사람이 "여기는 왜 없지" 를 확인하러 코드를 뒤지지 않아도 된다.
 */
@ApiTags('auth')
@ApiController('.well-known')
export class AdminDiscoveryController {
  constructor(@Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig) {}

  @Get('openid-configuration')
  @AdminPublic()
  @ApiOperation({
    summary: 'Discovery 문서',
    description:
      '관리자 access token 의 발급자(issuer)를 알려준다.\n\n' +
      '관리자 토큰은 대칭키로 서명하고 이 API 안에서만 쓰이므로, 공개키셋(JWKS)과 ' +
      '인가 엔드포인트는 제공하지 않는다.',
  })
  @ApiOkResponse({ type: AdminOpenIdConfigurationDto })
  discovery(@Res({ passthrough: true }) res: Response): Record<string, unknown> {
    const issuer = this.config.issuer;
    /*
      issuer 를 안 적은 환경에서는 빈 문서가 나간다. 그 상태를 캐시에 담으면 설정을 채워
      재시작해도 한동안 빈 문서가 돌아다닌다 — 담지 못하게 한다(공개 API 와 같은 규칙).
    */
    res.setHeader(
      'Cache-Control',
      issuer ? `public, max-age=${MAX_AGE_SEC}, must-revalidate` : 'no-store',
    );
    return issuer ? { issuer } : {};
  }
}
