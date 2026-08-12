import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * enum 필드 한 줄. **문서·변환·검증을 함께 건다.**
 *
 * 셋은 서로 다른 물건이다 — `@ApiProperty` 는 문서만, `@Transform` 은 값만, `@IsEnum` 은
 * 요청 검증만 한다. 따로 붙이면 그중 하나를 빠뜨리기 쉽고, 특히 변환만 빠지면 **문서에는
 * PUBLISHED 라고 적혀 있는데 응답은 2 로 나가는** 어긋남이 조용히 생긴다. 하나로 묶어 두면
 * 빠뜨릴 때 문서도 같이 비어서 눈에 띈다.
 *
 * ## 왜 변환이 필요한가
 *
 * 숫자 enum 은 컴파일되면 그냥 숫자다 — 런타임에 "이 2 가 PostStatus 였다" 는 정보가 남지
 * 않는다(TS 의 타입은 지워진다). 그래서 직렬화기가 스스로 이름을 알아낼 방법이 없고,
 * **필드마다 어느 enum 인지 알려주는 이 한 줄**이 그 정보가 된다.
 *
 * ## 양방향이 한 줄로 되는 이유
 *
 * 숫자 enum 은 색인이 양방향이다 — `S[2] === 'PUBLISHED'` 이고 `S['PUBLISHED'] === 2`.
 * 그래서 응답(숫자→이름)과 요청(이름→숫자)이 같은 식으로 처리된다.
 * 문자열 enum(값이 곧 이름)에 걸면 아무 일도 하지 않는다 — 그대로 통과한다.
 *
 * ## 쓰는 곳
 *
 * 응답 변환은 `ClassSerializerInterceptor` 가 실행한다. **전역으로 켜지 않았다면** 쓰는
 * 컨트롤러에 `@UseInterceptors(ClassSerializerInterceptor)` 를 달아야 응답에 반영된다.
 * 요청 변환은 전역 `ValidationPipe({ transform: true })` 가 이미 실행한다.
 *
 * ```ts
 * class PostDto {
 *   @EnumField(PostStatus, { description: '글 상태' })
 *   readonly status!: PostStatus;
 * }
 * ```
 */
export function EnumField(
  enumType: Record<string, string | number>,
  options: {
    description?: string;
    /** 요청에서 생략할 수 있는 필드인가. 응답 DTO 에는 쓰지 않는다. */
    optional?: boolean;
    /** 문서에 적을 기본값(이름). */
    default?: string;
  } = {},
): PropertyDecorator {
  const { description, optional = false, default: defaultName } = options;

  const table: Record<string | number, string | number | undefined> = enumType;
  const transform = Transform(
    ({ value }: { value: unknown }): string | number | undefined => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
      }
      const mapped = table[value];
      // 매칭이 없으면 원래 값을 그대로 둔다 — 여기서 undefined 로 바꾸면 잘못된 값이
      // "안 보낸 것" 으로 둔갑해 @IsOptional 을 통과한다.
      return mapped === undefined ? value : mapped;
    },
  );

  return applyDecorators(
    optional
      ? ApiPropertyOptional({
          enum: enumType,
          description,
          default: defaultName,
        })
      : ApiProperty({ enum: enumType, description, default: defaultName }),
    ...(optional ? [IsOptional()] : []),
    transform,
    IsEnum(enumType),
  );
}
