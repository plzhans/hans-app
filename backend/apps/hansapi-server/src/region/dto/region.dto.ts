import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegionDto {
  @ApiProperty({ type: String, example: '11001' })
  readonly code!: string;

  @ApiProperty({
    type: String,
    example: '서울특별시',
    description: '정식 명칭. **검색·매칭은 이걸 쓴다.**',
  })
  readonly name!: string;

  @ApiPropertyOptional({
    type: String,
    example: '서울',
    description:
      '화면 표시용 짧은 이름. 시도만 있다 — 시군구는 이미 짧다(강남구).\n' +
      '규칙으로 만들 수 없어 코드 테이블에 값으로 둔다 ' +
      '("충청북도"→"충북", "전남광주통합특별시"→"전남").',
  })
  readonly shortName?: string;

  @ApiProperty({ type: String, description: 'sido | sggu', example: 'sggu' })
  readonly level!: string;

  @ApiPropertyOptional({
    type: String,
    description: '시도 코드. 시도면 없다.',
    example: '11',
  })
  readonly parentCode?: string;
}
