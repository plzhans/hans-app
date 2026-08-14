import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) / OpenID Connect Discovery 문서.
 * 클라이언트는 이 문서 하나로 로그인·토큰·공개키 주소를 알아낸다.
 */
export class OpenIdConfigurationDto {
  @ApiPropertyOptional({
    description: '발급자 식별자. access token 의 `iss` 클레임과 같다.',
    example: 'https://api.plzhans.com',
  })
  readonly issuer?: string;

  @ApiPropertyOptional({
    description: '로그인 화면 주소. 인가 요청을 이리로 보낸다.',
    example: 'https://auth.plzhans.com/login',
  })
  readonly authorization_endpoint?: string;

  @ApiPropertyOptional({
    description: '토큰 발급·갱신 주소.',
    example: 'https://api.plzhans.com/oauth/token',
  })
  readonly token_endpoint?: string;

  @ApiPropertyOptional({
    description: 'access token 서명 검증용 공개키셋(JWKS) 주소.',
    example: 'https://api.plzhans.com/.well-known/jwks.json',
  })
  readonly jwks_uri?: string;

  @ApiProperty({
    description: '지원하는 grant type.',
    example: ['authorization_code', 'refresh_token'],
    type: [String],
  })
  readonly grant_types_supported!: string[];

  @ApiProperty({
    description: '지원하는 response type.',
    example: ['code'],
    type: [String],
  })
  readonly response_types_supported!: string[];

  @ApiProperty({
    description: '지원하는 PKCE 코드 챌린지 방식. 모든 인가 코드에 PKCE 를 요구한다.',
    example: ['S256'],
    type: [String],
  })
  readonly code_challenge_methods_supported!: string[];

  @ApiProperty({
    description: '토큰 엔드포인트의 클라이언트 인증 방식. 공개 클라이언트라 `none` 이다.',
    example: ['none'],
    type: [String],
  })
  readonly token_endpoint_auth_methods_supported!: string[];

  @ApiProperty({
    description: '토큰 서명 알고리즘. 대칭 폴백 모드에서는 빈 배열이다.',
    example: ['ES256'],
    type: [String],
  })
  readonly id_token_signing_alg_values_supported!: string[];

  @ApiProperty({
    description: '지원하는 subject 식별자 유형.',
    example: ['public'],
    type: [String],
  })
  readonly subject_types_supported!: string[];
}

/** JWK 하나(RFC 7517). access token 검증용 공개키라 비밀 파라미터는 포함되지 않는다. */
export class JsonWebKeyDto {
  @ApiProperty({ description: '키 종류', example: 'EC' })
  readonly kty!: string;

  @ApiPropertyOptional({ description: '곡선 이름(EC 키)', example: 'P-256' })
  readonly crv?: string;

  @ApiPropertyOptional({ description: '공개키 x 좌표(base64url)' })
  readonly x?: string;

  @ApiPropertyOptional({ description: '공개키 y 좌표(base64url)' })
  readonly y?: string;

  @ApiPropertyOptional({
    description: '키 식별자. 토큰 헤더의 `kid` 와 대조해 검증 키를 고른다.',
    example: 'iE5LAAsM8p-NGSKO',
  })
  readonly kid?: string;

  @ApiPropertyOptional({ description: '서명 알고리즘', example: 'ES256' })
  readonly alg?: string;

  @ApiPropertyOptional({ description: '키 용도', example: 'sig' })
  readonly use?: string;
}

/** JWKS(JSON Web Key Set). 퇴역한 키도 남아 있어 이미 발급된 토큰은 만료까지 검증된다. */
export class JwksDto {
  @ApiProperty({ description: '공개키 목록', type: [JsonWebKeyDto] })
  readonly keys!: JsonWebKeyDto[];
}
