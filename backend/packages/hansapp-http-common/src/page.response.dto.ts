import { ApiProperty } from '@nestjs/swagger';
import { Page } from '@hansapp/common';

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

  /**
   * 이미 DTO 로 바꾼 페이지를 응답으로. **인자가 하나다.**
   *
   * 변환은 페이지 쪽에서 끝내고 온다 — `page.map((post) => new PostDto(post))`.
   * 생성자처럼 페이지와 항목을 따로 받으면 한쪽에 다른 페이지를 넘겨도 타입이 맞아,
   * 총 개수는 A 페이지이고 항목은 B 페이지인 응답이 나갈 수 있다.
   */
  static from<T>(page: Page<T>): PageResponseDto<T> {
    return new PageResponseDto<T>(page, page.items);
  }

  constructor(page: Page<unknown>, items: T[]) {
    this.items = items;
    this.page = page.page;
    this.size = page.size;
    this.totalCount = page.totalCount;
    this.totalPages = page.totalPages;
  }
}
