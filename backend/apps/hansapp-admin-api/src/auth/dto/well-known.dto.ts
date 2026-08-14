import { ApiProperty } from '@nestjs/swagger';

/**
 * 관리자 API 의 OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * **issuer 하나뿐이다.** 공개 API 의 문서와 달리 여기에는 인가·공개키 주소가 없다 —
 * 관리자 access token 은 대칭키(HS256)로 서명하고 그 토큰을 쓰는 곳이 이 API 하나뿐이라,
 * 공개할 검증 키도 제3자에게 열어 줄 인가 흐름도 없기 때문이다.
 */
export class AdminOpenIdConfigurationDto {
  @ApiProperty({
    description: '발급자 식별자. 관리자 access token 의 `iss` 클레임과 같다.',
    example: 'https://admin.plzhans.com',
  })
  readonly issuer!: string;
}
