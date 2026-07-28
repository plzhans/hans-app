import { ApiProperty } from '@nestjs/swagger';

/**
 * 페이지네이션이 없는 목록 응답 공통 HTTP DTO.
 * 최상위를 항상 객체로 감싸기 위해 배열을 items 로 래핑한다(향후 메타데이터 확장 여지 확보).
 *
 * items 의 구체 타입은 제네릭이라 Swagger 스키마에 자동 반영되지 않으므로,
 * 각 컨트롤러에서 @ApiListResponse(ItemDto) 로 items 스키마를 명시한다.
 */
export class ListResponseDto<T> {
  @ApiProperty({ description: '목록 항목', isArray: true })
  readonly items: T[];

  constructor(items: T[]) {
    this.items = items;
  }
}
