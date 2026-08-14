import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtKeyService, Public } from '@hansapp/auth-application';

import { JwksDto, OpenIdConfigurationDto } from './dto/well-known.dto';

/*
  캐시 상한을 정하는 기준은 **"값이 바뀐 뒤 얼마나 늦게 반영돼도 되는가"** 다.
  서버 비용은 고려 대상이 아니다 — 두 응답 모두 부팅 때 만들어 둔 메모리 값을 조립할 뿐,
  요청마다 파일이나 DB 를 읽지 않는다(JwtKeyService 주석 참고).
*/

/**
 * JWKS. 키를 교체하면 **새 kid** 로 서명한 토큰이 나오고, 낡은 사본을 든 소비자는 그 토큰의
 * 서명을 확인할 수 없다(퇴역 키는 남겨 두므로 옛 토큰은 계속 검증된다).
 *
 * 구글은 5시간 넘게 물리는데, 그쪽은 새 키를 **미리 게시하고 나중에 서명에 쓴다.** 우리는
 * 그 예고 절차가 없어 배포 즉시 새 키로 서명하므로, 캐시 수명이 곧 회복 시간이다.
 */
const JWKS_MAX_AGE_SEC = 3600;

/**
 * discovery. 주소가 바뀌는 일은 드물지만, 바뀌었는데 못 따라오면 **로그인이 통째로 막힌다.**
 * 되찾는 데 드는 비용이 큰 쪽이라 JWKS 보다 짧게 잡는다.
 */
const DISCOVERY_MAX_AGE_SEC = 300;

/** `public` — 자격증명이 실리지 않는 공개 문서라 공용 캐시도 담을 수 있다. */
const cacheable = (maxAgeSec: number): string => `public, max-age=${maxAgeSec}, must-revalidate`;

/**
 * 성치 않은 응답에 붙인다.
 *
 * **모자란 값을 캐시하면 고쳐도 안 고쳐진다.** 키 디렉터리를 못 찾아 빈 키셋을 내보낸 채로
 * 한 시간이 박히면, 설정을 바로잡고 재시작해도 그 시간 동안 소비자는 옛 사본을 계속 쓴다.
 * 서버는 멀쩡한데 검증만 안 되는 상태라 원인을 찾기도 나쁘다 — 그래서 담지 못하게 한다.
 */
const NOT_CACHEABLE = 'no-store';

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
  jwks(@Res({ passthrough: true }) res: Response): { keys: Record<string, unknown>[] } {
    const jwks = this.keys.jwks();
    // 키가 하나도 없다 = 대칭 폴백이거나 키를 못 읽은 것이다. 둘 다 굳힐 상태가 아니다.
    setCacheControl(res, jwks.keys.length > 0, JWKS_MAX_AGE_SEC);
    return jwks;
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
  discovery(@Res({ passthrough: true }) res: Response): Record<string, unknown> {
    const document = this.keys.discovery();
    /*
      주소가 하나라도 비면 그 문서로는 연동을 마칠 수 없다 — issuer 나 auth.externalUrl 을
      안 적은 환경에서 그렇게 된다. 설정을 채워 재시작했는데 낡은 사본 때문에 여전히
      안 되는 일이 없도록, 온전할 때만 캐시하게 한다.
    */
    const complete = ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'].every(
      (key) => typeof document[key] === 'string',
    );
    setCacheControl(res, complete, DISCOVERY_MAX_AGE_SEC);
    return document;
  }
}

/** 데코레이터(@Header)로 못 하는 이유는 값이 응답 내용에 따라 갈리기 때문이다. */
function setCacheControl(res: Response, healthy: boolean, maxAgeSec: number): void {
  res.setHeader('Cache-Control', healthy ? cacheable(maxAgeSec) : NOT_CACHEABLE);
}
