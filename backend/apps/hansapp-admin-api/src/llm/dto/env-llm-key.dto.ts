import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EnvLlmKeyStatus,
  LlmKeyType,
  LlmProvider,
  type EnvLlmKeyView,
} from '@hansapp/admin-application';

export class EnvLlmKeyDto {
  @ApiProperty({ description: '행 번호. 화면과 로그가 이 값으로 추적한다.' })
  readonly id!: number;

  @ApiProperty({
    description: 'ANTHROPIC · OPENAI · LOCAL. SDK 어댑터를 고른다.',
  })
  readonly provider!: string;

  @ApiProperty({
    description:
      'provider 안에서의 신원. **LOCAL 만 갖는다** — 호스팅 업체는 하나뿐이라 빈 문자열이다.',
  })
  readonly name!: string;

  @ApiProperty({
    description:
      '값을 어떻게 실어 보내는가. API_KEY=x-api-key, AUTH_TOKEN=Bearer(+oauth 베타 헤더)',
  })
  readonly keyType!: string;

  @ApiProperty({ description: '키가 있는가. **원문은 내려보내지 않는다.**' })
  readonly hasSecret!: boolean;

  @ApiPropertyOptional({ description: '키의 뒤 4자(업체 콘솔과 대조용)' })
  readonly secretSuffix!: string | null;

  @ApiPropertyOptional({ description: '비우면 업체 기본 주소. LOCAL 은 필수.' })
  readonly baseUrl!: string | null;

  @ApiProperty({ description: '지정 없는 호출이 이 키로 나가는가' })
  readonly isDefault!: boolean;

  @ApiProperty({ description: 'ACTIVE · DISABLED' })
  readonly status!: string;

  @ApiProperty() readonly createdAt!: Date;
  @ApiProperty() readonly updatedAt!: Date;

  constructor(view: EnvLlmKeyView) {
    this.id = view.id;
    this.provider = view.provider;
    this.name = view.name;
    this.keyType = view.keyType;
    this.hasSecret = view.hasSecret;
    this.secretSuffix = view.secretSuffix;
    this.baseUrl = view.baseUrl;
    this.isDefault = view.isDefault;
    this.status = view.status;
    this.createdAt = view.createdAt;
    this.updatedAt = view.updatedAt;
  }
}

/**
 * 만들거나 고칠 값.
 *
 * **키는 평문으로 받는다.** 잠그는 것은 서버가 한다 — 화면이 암호화하면 키가 브라우저에
 * 있어야 하고, 그 순간 잠근 의미가 사라진다.
 *
 * 수정에서는 **보내지 않은 필드를 건드리지 않는다.** 화면이 마스킹된 값을 되돌려 보내
 * 실수로 지우는 일이 없게 한다.
 */
export class EnvLlmKeySaveRequestDto {
  @ApiPropertyOptional({
    enum: LlmProvider,
    description: 'GOOGLE 은 아직 못 부른다.',
  })
  @IsOptional()
  @IsEnum(LlmProvider)
  readonly provider?: LlmProvider;

  @ApiPropertyOptional({
    description: '이름. **LOCAL 은 필수, 그 밖에는 무시된다**(업체가 신원이다).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly name?: string;

  @ApiPropertyOptional({
    enum: LlmKeyType,
    description: 'AUTH_TOKEN 은 ANTHROPIC 에서만 고를 수 있다(개인 구독 토큰).',
  })
  @IsOptional()
  @IsEnum(LlmKeyType)
  readonly keyType?: LlmKeyType;

  @ApiPropertyOptional({ description: '키(평문). 빈 값이면 지운다.' })
  @IsOptional()
  @IsString()
  readonly secret?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly baseUrl?: string | null;

  @ApiPropertyOptional({ enum: EnvLlmKeyStatus })
  @IsOptional()
  @IsEnum(EnvLlmKeyStatus)
  readonly status?: EnvLlmKeyStatus;
}

/**
 * 모델 목록 조회 요청.
 *
 * **저장 전에도 부를 수 있다.** 등록 화면에서 키를 막 입력한 상태로 확인할 수 있어야 하므로,
 * `id` 를 주면 저장된 키를 쓰고 안 주면 여기 실린 값으로 업체에 물어본다.
 */
export class VendorModelsRequestDto {
  @ApiPropertyOptional({
    description: '저장된 키의 id. 없으면 아래 값으로 부른다.',
  })
  @IsOptional()
  @IsInt()
  readonly id?: number;

  @ApiPropertyOptional({ enum: LlmProvider })
  @IsOptional()
  @IsEnum(LlmProvider)
  readonly provider?: LlmProvider;

  @ApiPropertyOptional({ enum: LlmKeyType })
  @IsOptional()
  @IsEnum(LlmKeyType)
  readonly keyType?: LlmKeyType;

  @ApiPropertyOptional({ description: '키(평문). 비우면 저장된 것을 연다.' })
  @IsOptional()
  @IsString()
  readonly secret?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly baseUrl?: string | null;
}

export class VendorModelsResponseDto {
  @ApiProperty({ type: [String], description: '업체가 준 모델 id 목록' })
  readonly models!: string[];

  constructor(models: string[]) {
    this.models = models;
  }
}
