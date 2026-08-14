import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtKeyService, Public } from '@hansapp/auth-application';

import { JwksDto, OpenIdConfigurationDto } from './dto/well-known.dto';

/**
 * access token 공개키 공개(JWKS)와 OIDC discovery.
 *
 * MSA 소비자는 여기서 공개키(kid별)를 가져가 access token 을 검증한다. 개인키는 절대 노출되지 않는다.
 * 대칭(HS256) 폴백 모드면 keys 는 빈 배열이다(노출할 공개키 없음).
 */
@ApiTags('oauth')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly keys: JwtKeyService) {}

  @Get('jwks.json')
  @Public()
  @ApiOperation({
    summary: '공개키셋(JWKS)',
    description:
      'access token 서명 검증에 쓰는 공개키를 반환한다. 토큰 헤더의 `kid` 로 키를 고른다.\n\n' +
      '키를 교체해도 퇴역한 키의 공개키가 남아 있어, 이미 발급된 토큰은 만료될 때까지 검증된다. ' +
      '주소는 discovery 문서의 `jwks_uri` 로 알아내는 것을 권장한다.',
  })
  @ApiOkResponse({ type: JwksDto })
  jwks(): { keys: Record<string, unknown>[] } {
    return this.keys.jwks();
  }

  @Get('openid-configuration')
  @Public()
  @ApiOperation({
    summary: 'Discovery 문서',
    description:
      '로그인·토큰 발급·공개키 주소를 한 번에 알려준다(RFC 8414 / OpenID Connect Discovery). ' +
      '표준 클라이언트 라이브러리는 이 주소만으로 연동을 마칠 수 있다.\n\n' +
      '지원하는 흐름은 authorization code + PKCE(S256) 이며, 모든 인가 코드에 PKCE 를 요구한다.',
  })
  @ApiOkResponse({ type: OpenIdConfigurationDto })
  discovery(): Record<string, unknown> {
    return this.keys.discovery();
  }
}
