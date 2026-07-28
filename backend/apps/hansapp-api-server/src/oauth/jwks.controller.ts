import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtKeyService, Public } from '@hansapp/auth-application';

/**
 * access token 공개키 공개(JWKS)와 OIDC discovery.
 *
 * MSA 소비자는 여기서 공개키(kid별)를 가져가 access token 을 검증한다. 개인키는 절대 노출되지 않는다.
 * 대칭(HS256) 폴백 모드면 keys 는 빈 배열이다(노출할 공개키 없음).
 */
@Controller('.well-known')
export class JwksController {
  constructor(private readonly keys: JwtKeyService) {}

  @Get('jwks.json')
  @Public()
  @ApiExcludeEndpoint()
  jwks(): { keys: Record<string, unknown>[] } {
    return this.keys.jwks();
  }

  @Get('openid-configuration')
  @Public()
  @ApiExcludeEndpoint()
  discovery(): Record<string, unknown> {
    return this.keys.discovery();
  }
}
