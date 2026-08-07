import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LlmKeyVerifyState, LlmProvider } from '@hansapp/auth-application';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 이름 규칙: 영숫자로 시작하고 점·하이픈·밑줄을 허용한다. 서비스의 검증과 맞춘다. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const NAME_MESSAGE =
  '이름은 영숫자로 시작하고 영숫자·점(.)·하이픈(-)·밑줄(_)만 사용할 수 있습니다.';

const NAME_DESCRIPTION =
  '이름(LOCAL 전용, 필수). 여러 대를 구분하는 값이다. ' +
  'OpenAI·Anthropic·Google 은 앱당 하나뿐이라 보내도 무시된다.';

const SECRET_DESCRIPTION =
  '업체 API 키 원문. **저장 후 다시 조회할 수 없다**(뒤 4자만 내려간다). ' +
  'LOCAL 은 대개 인증이 없어 생략할 수 있다.';

const BASE_URL_DESCRIPTION =
  '엔드포인트(스킴+호스트). LOCAL 은 필수다 — 어느 기계인지가 이 값으로만 갈린다. ' +
  '호스팅 업체는 비우면 서버 기본값을 쓴다.';

const LIMIT_DESCRIPTION =
  '지출 상한(마이크로 USD, 1000000 = $1). null 이면 무제한. LOCAL 은 청구서가 없어 의미가 없다.';

const FALLBACK_DESCRIPTION =
  '상한에 걸렸을 때 서비스 키로 넘어갈지. 기본은 넘어가지 않고 거절한다.';

export class CreateLlmKeyDto {
  @ApiProperty({ enum: LlmProvider, description: 'LLM 업체' })
  @IsEnum(LlmProvider)
  readonly provider!: LlmProvider;

  @ApiPropertyOptional({ description: NAME_DESCRIPTION, example: 'gpu-server' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  readonly name?: string;

  @ApiPropertyOptional({ description: SECRET_DESCRIPTION })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  readonly secret?: string;

  @ApiPropertyOptional({
    description: BASE_URL_DESCRIPTION,
    example: 'http://10.0.0.7:11434',
  })
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(200)
  readonly baseUrl?: string;

  @ApiPropertyOptional({ description: '기본 모델. 비우면 서버 기본값을 쓴다.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly defaultModel?: string;

  @ApiPropertyOptional({ description: `월 ${LIMIT_DESCRIPTION}` })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly monthlyLimitMicroUsd?: number;

  @ApiPropertyOptional({ description: `일 ${LIMIT_DESCRIPTION}` })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly dailyLimitMicroUsd?: number;

  @ApiPropertyOptional({ description: FALLBACK_DESCRIPTION })
  @IsOptional()
  @IsBoolean()
  readonly fallbackToService?: boolean;

  @ApiPropertyOptional({
    description: '사용 여부. 끄면 이 키로 부르지 않는다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;
}

/**
 * 수정. **보내지 않은 항목은 건드리지 않는다.**
 *
 * provider 가 없는 것은 의도다 — 업체를 바꾸는 것은 다른 키를 쓰겠다는 뜻이라 새로 등록해야 한다.
 * secret 도 보낼 때만 교체된다. 상한만 고치려고 키를 다시 입력하게 만들지 않는다.
 */
export class UpdateLlmKeyDto {
  @ApiPropertyOptional({ description: NAME_DESCRIPTION, example: 'gpu-server' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  readonly name?: string;

  @ApiPropertyOptional({
    description: `${SECRET_DESCRIPTION} 보내면 교체되고, 판정은 미확인으로 되돌아간다.`,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  readonly secret?: string;

  @ApiPropertyOptional({ description: BASE_URL_DESCRIPTION })
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(200)
  readonly baseUrl?: string;

  @ApiPropertyOptional({ description: '기본 모델. 비우면 서버 기본값을 쓴다.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly defaultModel?: string;

  @ApiPropertyOptional({ description: `월 ${LIMIT_DESCRIPTION}` })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly monthlyLimitMicroUsd?: number | null;

  @ApiPropertyOptional({ description: `일 ${LIMIT_DESCRIPTION}` })
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly dailyLimitMicroUsd?: number | null;

  @ApiPropertyOptional({ description: FALLBACK_DESCRIPTION })
  @IsOptional()
  @IsBoolean()
  readonly fallbackToService?: boolean;

  @ApiPropertyOptional({
    description: '사용 여부. 끄면 이 키로 부르지 않는다.',
  })
  @IsOptional()
  @IsBoolean()
  readonly enabled?: boolean;
}

/** 등록된 업체 키 한 건. **잠긴 값은 어느 경로로도 내려가지 않는다.** */
export class LlmKeyDto {
  @ApiProperty() readonly id!: number;

  @ApiProperty({ enum: LlmProvider }) readonly provider!: LlmProvider;

  @ApiProperty({
    description: '이름. 호스팅 업체는 빈 문자열이다.',
    example: 'gpu-server',
  })
  readonly name!: string;

  @ApiPropertyOptional({
    description: '표시용 키 뒤 4자. 업체 콘솔의 키 목록과 대조하는 단서다.',
    example: 'aB3f',
  })
  readonly secretSuffix?: string | null;

  @ApiPropertyOptional({ description: '엔드포인트' })
  readonly baseUrl?: string | null;

  @ApiPropertyOptional({ description: '기본 모델' })
  readonly defaultModel?: string | null;

  @ApiPropertyOptional({ description: '월 지출 상한(마이크로 USD)' })
  readonly monthlyLimitMicroUsd?: number | null;

  @ApiPropertyOptional({ description: '일 지출 상한(마이크로 USD)' })
  readonly dailyLimitMicroUsd?: number | null;

  @ApiProperty({ description: FALLBACK_DESCRIPTION })
  readonly fallbackToService!: boolean;

  @ApiProperty({
    enum: LlmKeyVerifyState,
    description:
      '키 판정. 등록 시점에는 업체에 물어보지 않으므로 늘 UNVERIFIED 이고, ' +
      '첫 실사용의 결과가 VALID·INVALID 를 정한다.',
  })
  readonly verifyState!: LlmKeyVerifyState;

  @ApiPropertyOptional({ description: '마지막 판정 시각' })
  readonly verifiedAt?: string | null;

  @ApiPropertyOptional({ description: '판정 실패 사유(업체 응답 요약)' })
  readonly verifyError?: string | null;

  @ApiProperty() readonly enabled!: boolean;

  @ApiPropertyOptional({ description: '마지막 사용 시각' })
  readonly lastUsedAt?: string | null;

  @ApiProperty() readonly createdAt!: string;
}
