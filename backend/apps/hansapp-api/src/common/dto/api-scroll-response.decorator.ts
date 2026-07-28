import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ScrollResponseDto } from './scroll.response.dto';

/**
 * 제네릭 ScrollResponseDto<Item> 의 items 스키마를 Swagger 에 명시하는 헬퍼.
 * ScrollResponseDto 의 items 는 제네릭이라 자동으로 타입이 잡히지 않으므로,
 * 컨트롤러에서 @ApiScrollResponse(ItemDto) 로 감싸 실제 항목 타입을 노출한다.
 * (페이지네이션의 @ApiPageResponse 와 같은 구조다.)
 */
export const ApiScrollResponse = <TModel extends Type<unknown>>(
  model: TModel,
) =>
  applyDecorators(
    ApiExtraModels(ScrollResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ScrollResponseDto) },
          {
            properties: {
              items: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
