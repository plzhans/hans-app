import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '@hansapp/application';

// ── 요청 ───────────────────────────────────────────────────

/**
 * 영문 주소 검색 조건.
 *
 * 한글 주소(또는 그 일부)를 keyword 로 넣으면 매칭되는 주소를 영문 표기와 함께 돌려준다.
 * **시/도명 단독·한 글자·숫자만으로는 검색되지 않는다**(도로명주소 API 제약).
 */
export class AddressSearchRequestDto {
  @ApiProperty({
    description: '검색할 한글 주소(또는 일부). 예: 도로명주소·건물명·지번.',
    example: '부산광역시 금정구 중앙대로1985번길 1',
  })
  @IsString()
  @MinLength(2, { message: 'keyword must be at least 2 characters.' })
  readonly keyword!: string;

  @ApiPropertyOptional({ description: '페이지 번호', default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: DEFAULT_PAGE_SIZE,
    minimum: MIN_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  readonly size: number = DEFAULT_PAGE_SIZE;
}

// ── 응답 ───────────────────────────────────────────────────

/**
 * 영문 주소 한 건.
 *
 * **korAddr 은 한글, 나머지 주소 필드는 영문이다.** 도로명주소 API 가 한글 검색어를
 * 정규화한 한글주소(korAddr)와 공식 영문 표기를 함께 준다. 영문은 순서가 뒤집힌다 —
 * 한글은 큰 단위→작은 단위, 영문은 작은 단위→큰 단위.
 */
export class AddressDto {
  @ApiProperty({
    description: '한글 도로명주소(정규화됨)',
    example: '부산광역시 금정구 중앙대로1985번길 1',
  })
  readonly korAddr!: string;

  @ApiProperty({
    description: '영문 도로명주소(전체)',
    example: '1 Jungang-daero 1985beon-gil, Geumjeong-gu, Busan',
  })
  readonly roadAddr!: string;

  @ApiPropertyOptional({
    description: '영문 지번주소',
    example: '129-13 Namsan-dong, Geumjeong-gu, Busan',
  })
  readonly jibunAddr?: string;

  @ApiPropertyOptional({ description: '우편번호(5자리)', example: '46227' })
  readonly zipNo?: string;

  @ApiPropertyOptional({ description: '영문 시도명', example: 'Busan' })
  readonly sido?: string;

  @ApiPropertyOptional({
    description: '영문 시군구명',
    example: 'Geumjeong-gu',
  })
  readonly sigungu?: string;

  @ApiPropertyOptional({ description: '영문 읍면동명', example: 'Namsan-dong' })
  readonly eupmyeondong?: string;

  @ApiPropertyOptional({
    description: '영문 도로명',
    example: 'Jungang-daero 1985beon-gil',
  })
  readonly roadName?: string;
}
