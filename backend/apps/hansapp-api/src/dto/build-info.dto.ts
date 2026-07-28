import { ApiProperty } from '@nestjs/swagger';

/**
 * 빌드 신원. GET /version 의 응답이다.
 *
 * 인터페이스가 아니라 클래스여야 한다. Swagger 는 런타임 메타데이터로 스키마를 만드는데,
 * 인터페이스는 컴파일되면 사라져서 응답 스키마가 통째로 비어 버린다(문서에 아무것도 안 나온다).
 */
export class BuildInfoDto {
  @ApiProperty({ example: '0.0.1+a1b2c3d', description: '표시·로그용 버전' })
  readonly version!: string;

  @ApiProperty({
    example: '0.0.1-a1b2c3d',
    description: "docker 태그·파일명용 ('+' 를 못 쓰는 곳)",
  })
  readonly tagVersion!: string;

  @ApiProperty({ example: '0.0.1', description: 'package.json 의 버전' })
  readonly semver!: string;

  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: '빌드된 커밋. 이게 진짜 신원이다.',
  })
  readonly sha!: string;

  @ApiProperty({ example: 'main' })
  readonly branch!: string;

  @ApiProperty({ example: '2026-07-14T02:45:00Z' })
  readonly builtAt!: string;

  @ApiProperty({ example: '24.18.0', description: '빌드에 쓰인 node 버전' })
  readonly node!: string;
}
