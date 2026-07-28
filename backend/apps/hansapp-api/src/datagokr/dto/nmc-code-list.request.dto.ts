import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { MirrorListRequestDto } from './mirror-list.request.dto';

/** NMC 코드마스터 조회 요청. 대분류코드로 종류를 좁힌다. */
export class NmcCodeListRequestDto extends MirrorListRequestDto {
  @ApiPropertyOptional({
    description:
      '대분류코드(cmMid). 예: H010=설립구분. 생략하면 전체 코드를 반환한다.',
    example: 'H010',
  })
  @IsOptional()
  @IsString()
  readonly cmMid?: string;
}
