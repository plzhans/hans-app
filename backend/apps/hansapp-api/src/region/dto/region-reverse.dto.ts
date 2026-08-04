import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

import { RegionDto } from './region.dto';

/**
 * 역지오코딩 요청. 브라우저 `navigator.geolocation` 이 준 좌표를 그대로 실어 보낸다.
 *
 * **정확도(accuracy)는 받지 않는다.** 오차가 큰 좌표라도 그 광역권은 맞으므로 지역을 고르는
 * 데는 쓸 만하고, 사용자가 결과(콤보박스에 찍힌 시도·시군구)를 보고 고칠 수 있다.
 */
export class RegionReverseRequestDto {
  @ApiProperty({ description: '위도', example: 37.5597 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  readonly lat!: number;

  @ApiProperty({ description: '경도', example: 127.1935 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  readonly lon!: number;
}

/**
 * 좌표가 속한 지역.
 *
 * **두 코드를 병원 검색의 지역 필터에 그대로 넣으면 된다** — `region` 이 있으면 그 시군구 코드를,
 * 없으면 `sido` 코드를 `region` 파라미터로 보낸다(검색 API 는 시도 코드도 받아 하위로 편다).
 */
export class RegionPointDto {
  @ApiProperty({ type: RegionDto, description: '시도. 늘 있다.' })
  readonly sido!: RegionDto;

  @ApiPropertyOptional({
    type: RegionDto,
    description:
      '시군구. **없을 수 있다** — 세종특별자치시처럼 시군구가 없는 시도가 있다.',
  })
  readonly region?: RegionDto;
}
