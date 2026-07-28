import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { ListResponseDto } from './list.response.dto';

/**
 * 제네릭 ListResponseDto<Item> 의 items 스키마를 Swagger 에 명시하는 헬퍼.
 * ListResponseDto 의 items 는 제네릭이라 자동으로 타입이 잡히지 않으므로,
 * 컨트롤러에서 @ApiListResponse(ItemDto) 로 감싸 실제 항목 타입을 노출한다.
 */
export const ApiListResponse = <TModel extends Type<unknown>>(model: TModel) =>
  applyDecorators(
    ApiExtraModels(ListResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ListResponseDto) },
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
