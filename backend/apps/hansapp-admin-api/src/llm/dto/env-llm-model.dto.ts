import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { EnvLlmModelView } from '@hansapp/admin-application';

export class EnvLlmModelDto {
  @ApiProperty({ description: '행 번호' })
  readonly id!: number;

  @ApiProperty({ description: '어느 키로 부르는 모델인가' })
  readonly keyId!: number;

  @ApiProperty({
    description: '업체에 실어 보내는 모델 id. 날짜 없는 별칭을 쓴다.',
  })
  readonly name!: string;

  @ApiProperty({
    description: '끄면 목록에는 남되 부를 수 없다. 지우는 것과 다르다.',
  })
  readonly enabled!: boolean;

  @ApiProperty({
    description: '모델을 안 적은 요청이 이 모델로 나가는가. 키마다 하나만 참.',
  })
  readonly isDefault!: boolean;

  @ApiProperty({ description: '목록에서의 자리. 작은 것이 앞이다.' })
  readonly sortOrder!: number;

  @ApiProperty() readonly createdAt!: Date;
  @ApiProperty() readonly updatedAt!: Date;

  constructor(view: EnvLlmModelView) {
    this.id = view.id;
    this.keyId = view.keyId;
    this.name = view.name;
    this.enabled = view.enabled;
    this.isDefault = view.isDefault;
    this.sortOrder = view.sortOrder;
    this.createdAt = view.createdAt;
    this.updatedAt = view.updatedAt;
  }
}

export class EnvLlmModelCreateRequestDto {
  @ApiProperty({ description: '어느 키에 더할지' })
  @IsInt()
  readonly keyId!: number;

  @ApiProperty({ description: '모델 id. 같은 키에 같은 이름은 한 번만.' })
  @IsString()
  @MaxLength(100)
  readonly name!: string;

  @ApiPropertyOptional({ description: '기본 true' })
  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;
}

/** 고칠 값. 보내지 않은 필드는 건드리지 않는다. */
export class EnvLlmModelUpdateRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @ApiPropertyOptional({
    description: '기본 모델은 끌 수 없다 — 먼저 다른 것을 기본으로 옮긴다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;
}

/**
 * 차례를 다시 매긴다. **한 키의 것을 통째로 받는다** — 두 줄만 맞바꾸는 요청은 사이에
 * 다른 변경이 끼면 결과가 갈리는데, 통째로 받으면 화면이 본 그대로가 된다.
 */
export class EnvLlmModelReorderRequestDto {
  @ApiProperty({ description: '어느 키의 목록인가' })
  @IsInt()
  readonly keyId!: number;

  @ApiProperty({
    type: [Number],
    description: '그 키의 모델 id 를 원하는 차례대로 **빠짐없이** 나열한다.',
  })
  @IsArray()
  @IsInt({ each: true })
  @ArrayNotEmpty()
  readonly ids!: number[];
}
