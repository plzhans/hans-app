import { Get, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import type { Response } from 'express';
import { ADMIN_AUTH_CONFIG, AdminJwtService, AdminPublic } from '@hansapp/admin-application/auth';
import type { AdminAuthConfig } from '@hansapp/admin-application/auth';

import { AdminJwksDto, AdminOpenIdConfigurationDto } from './dto/well-known.dto';

/**
 * 캐시 상한(초). 설정값 하나를 그대로 내보내는 응답이라 서버 비용이 없고,
 * 값이 바뀌면 빨리 따라와야 하므로 짧게 잡는다.
 */
const MAX_AGE_SEC = 60;

/**
 * JWKS 캐시 상한(초).
 *
 * **키를 바꾸면 그 순간부터 새 kid 로 서명한다.** 예고 게시 절차가 없어서 캐시 수명이 곧
 * 회복 시간이다. 소비자(배치)는 모르는 kid 를 만나면 다시 받아 가므로 길어도 되지만,
 * 그 재조회가 실패하는 동안은 수동 실행이 막히니 짧게 잡는다(공개 API 는 1시간).
 */
const JWKS_MAX_AGE_SEC = 300;

/**
 * 관리자 API 의 discovery 문서와 공개키셋.
 *
 * **JWKS 는 비대칭 서명일 때만 내용이 있다**(admin.jwt.keyDir). 대칭키는 공개하는 순간
 * 서명 키가 새므로 어떤 형태로도 싣지 않고, 그때는 빈 배열이 나간다.
 *
 * 받아 가는 쪽은 배치다. 관리자 콘솔이 "지금 실행" 을 서명해 보내면 배치가 여기 공개키로
 * 검증한다 — **그래서 키를 바꿔도 배치는 손대지 않는다.** 공개키 사본을 배치 설정에 박으면
 * 배치와 무관한 키 교체가 배치 배포를 부른다.
 *
 * 인가 흐름은 없다. 관리자 로그인은 이 API 안에서 끝나 제3자에게 열어 줄 통로가 없다.
 */
@ApiTags('auth')
@ApiController('.well-known')
export class AdminDiscoveryController {
  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    private readonly keys: AdminJwtService,
  ) {}

  @Get('jwks.json')
  @AdminPublic()
  @ApiOperation({
    summary: '공개키셋(JWKS)',
    description:
      '관리자 토큰의 서명을 검증할 공개키를 준다. 토큰 헤더의 `kid` 로 키를 고른다.\n\n' +
      '**대칭키로 서명하는 환경에서는 빈 배열이다**(`admin.jwt.keyDir` 미설정). ' +
      '그 경우 배치는 수동 실행 요청을 검증할 수 없어 그 기능만 막힌다.',
  })
  @ApiOkResponse({ type: AdminJwksDto })
  jwks(@Res({ passthrough: true }) res: Response): AdminJwksDto {
    const jwks = this.keys.jwks();
    /*
      **빈 키셋은 캐시하지 않는다.** 키를 못 읽어 비었을 수도 있는데, 그 상태가 캐시에
      박히면 설정을 고쳐 재시작해도 그동안 소비자가 옛 사본을 계속 쓴다.
    */
    res.setHeader(
      'Cache-Control',
      jwks.keys.length > 0 ? `public, max-age=${JWKS_MAX_AGE_SEC}, must-revalidate` : 'no-store',
    );
    return jwks;
  }

  @Get('openid-configuration')
  @AdminPublic()
  @ApiOperation({
    summary: 'Discovery 문서',
    description:
      '관리자 access token 의 발급자(issuer)를 알려준다.\n\n' +
      '인가 엔드포인트는 제공하지 않는다 — 관리자 로그인은 이 API 안에서 끝난다.\n\n' +
      '`jwks_uri` 는 관리자 토큰을 **비대칭으로 서명할 때만** 실린다.',
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
    if (!issuer) return {};
    // 공개할 키가 있을 때만 주소를 싣는다. 빈 키셋을 가리키면 받는 쪽이 헛돈다.
    return this.keys.isAsymmetric
      ? { issuer, jwks_uri: `${issuer}/.well-known/jwks.json` }
      : { issuer };
  }
}
