import { ApiProperty } from '@nestjs/swagger';
import { Page } from '@hansapi/common';

/**
 * 목록 응답 공통 HTTP DTO. application 계층의 Page<T> 를 API 응답 형태로 매핑한다.
 * 항목(items)은 각 엔드포인트의 ResponseDto 로 변환해 넘긴다.
 *
 * items 의 구체 타입은 제네릭이라 Swagger 스키마에 자동 반영되지 않는다.
 * 각 컨트롤러에서 @ApiPageResponse(ItemDto) 로 items 스키마를 명시한다.
 */
export class PageResponseDto<T> {
  @ApiProperty({ description: '목록 항목', isArray: true })
  readonly items: T[];

  @ApiProperty({ description: '현재 페이지 번호' })
  readonly page: number;

  @ApiProperty({ description: '페이지 크기' })
  readonly size: number;

  @ApiProperty({ description: '전체 항목 수' })
  readonly totalCount: number;

  @ApiProperty({ description: '전체 페이지 수' })
  readonly totalPages: number;

  constructor(page: Page<unknown>, items: T[]) {
    this.items = items;
    this.page = page.page;
    this.size = page.size;
    this.totalCount = page.totalCount;
    this.totalPages = page.totalPages;
  }
}
