import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 관리자 API 의 OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * **인가 흐름은 없다.** 관리자 로그인은 이 API 안에서 끝나고 제3자에게 열어 줄 통로가 없다.
 * 그래서 공개 API 의 문서와 달리 authorization_endpoint·token_endpoint 가 없다.
 *
 * `jwks_uri` 는 **관리자 토큰을 비대칭으로 서명할 때만** 실린다(admin.jwt.keyDir).
 * 대칭키로 서명하면 나눠 줄 공개키가 없다 — 그 키는 공개하는 순간 서명 키가 새는 것이다.
 */
export class AdminOpenIdConfigurationDto {
  @ApiProperty({
    description: '발급자 식별자. 관리자 access token 의 `iss` 클레임과 같다.',
    example: 'https://admin.plzhans.com',
  })
  readonly issuer!: string;

  @ApiPropertyOptional({
    description: '관리자 토큰 서명 검증용 공개키셋(JWKS) 주소. **비대칭 서명일 때만 실린다.**',
    example: 'https://admin.plzhans.com/.well-known/jwks.json',
  })
  readonly jwks_uri?: string;
}

/** 공개키셋(JWKS). RFC 7517. */
export class AdminJwksDto {
  @ApiProperty({
    description: '공개키 목록. 토큰 헤더의 `kid` 로 고른다. 대칭 서명 환경에서는 빈 배열이다.',
    example: [{ kty: 'EC', crv: 'P-256', x: '…', y: '…', kid: 'a1b2c3', alg: 'ES256', use: 'sig' }],
  })
  readonly keys!: Record<string, unknown>[];
}
