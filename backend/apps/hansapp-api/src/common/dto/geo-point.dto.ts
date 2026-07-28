import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 지리 좌표(위경도) 공통 응답 DTO.
 * 여러 API 응답에서 좌표 블록을 공유하기 위해 common 으로 올린 표현계층 타입이다.
 */
export class GeoPointDto {
  @ApiPropertyOptional({ description: '위도' })
  readonly lat?: number;
  @ApiPropertyOptional({ description: '경도' })
  readonly lon?: number;
}
