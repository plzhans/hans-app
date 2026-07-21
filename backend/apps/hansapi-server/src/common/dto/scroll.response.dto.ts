import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 무한 스크롤 응답 공통 HTTP DTO. **페이지네이션(PageResponseDto)의 커서 버전이다.**
 *
 * 총건수·총페이지가 없다 — 스크롤은 "다음이 더 있냐" 만 알면 되고, 총건수는 매 호출 COUNT 를
 * 강요해 비싸다. 대신 nextToken 하나로 이어받기를 표현한다.
 *
 * items 의 구체 타입은 제네릭이라 Swagger 스키마에 자동 반영되지 않는다.
 * 각 컨트롤러에서 @ApiScrollResponse(ItemDto) 로 items 스키마를 명시한다.
 */
export class ScrollResponseDto<T> {
  @ApiProperty({ description: '목록 항목', isArray: true })
  readonly items: T[];

  @ApiPropertyOptional({
    description:
      '다음 스크롤 커서. 다음 호출에 그대로 실어 보내면 이 지점 다음부터 이어 준다. ' +
      '**없으면 다음 페이지가 없다는 뜻이다** — 스크롤을 멈춘다. 불투명 문자열이니 해석하지 마라.',
  })
  readonly nextToken?: string;

  constructor(items: T[], nextToken?: string) {
    this.items = items;
    this.nextToken = nextToken;
  }
}
