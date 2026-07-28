import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '@hansapp/application';

/**
 * 미러 목록 조회 요청.
 *
 * 검색 조건(이름·주소 등)은 아직 없다. JSON 컬럼에 generated column + 인덱스를 걸기 전까지는
 * 8만 행 전체 스캔이 되기 때문이다. 인덱스를 만든 뒤 조건을 추가한다.
 */
export class MirrorListRequestDto {
  @ApiPropertyOptional({ description: '페이지 번호', default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: DEFAULT_PAGE_SIZE,
    minimum: MIN_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  readonly size: number = DEFAULT_PAGE_SIZE;
}
