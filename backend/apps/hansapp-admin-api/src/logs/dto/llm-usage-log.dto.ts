import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { LlmUsageLogEntry } from '@hansapp/admin-application';

/**
 * LLM 호출 이력 조회 조건.
 *
 * **기간(`from`)이 사실상 필수다.** 이 표의 인덱스는 `created_at` 이 앞자리라 기간이
 * 빠지면 어떤 조건을 붙여도 표를 통째로 훑는다. 예외는 `requestId` 하나뿐이다 —
 * 그건 단독 인덱스가 있어서, 애플리케이션 로그에서 id 만 들고 넘어올 수 있다.
 * 둘 다 없으면 서버가 400 으로 거절한다.
 */
export class LlmUsageLogQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: 30,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly size: number = 30;

  @ApiPropertyOptional({
    description: '시작 시각(ISO 8601, 포함). requestId 가 없으면 필수.',
    example: '2026-08-03T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  readonly from?: string;

  @ApiPropertyOptional({
    description: '종료 시각(ISO 8601, 포함). 없으면 지금까지.',
    example: '2026-08-10T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  readonly to?: string;

  @ApiPropertyOptional({
    description: '추적 id(X-Request-Id) 정확 일치. 애플리케이션 로그에서 본 값으로 바로 찾는다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly requestId?: string;

  @ApiPropertyOptional({ description: '기능', example: 'hospital-search' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly feature?: string;

  @ApiPropertyOptional({
    description: '우리 Redis 캐시에서 나온 답만(true) 또는 실제 호출만(false). 없으면 둘 다.',
  })
  @IsOptional()
  // 쿼리스트링은 문자열로 온다. 'true'/'false' 만 값으로 보고 나머지는 안 보낸 것으로 둔다.
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  readonly cached?: boolean;

  @ApiPropertyOptional({ description: '앱 번호' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  readonly appId?: number;

  @ApiPropertyOptional({ description: '회원번호' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  readonly userId?: number;
}

/**
 * LLM 호출 한 건.
 *
 * **질문 원문도 프롬프트 전문도 없다** — 표에 애초에 담지 않는다(해시만 있다).
 * 그래서 이력 화면이 모든 칸을 그대로 보여줘도 새어 나갈 것이 없다.
 */
export class LlmUsageLogDto {
  @ApiProperty({ description: '로그 식별자. BigInt 라 문자열로 준다.' })
  readonly id!: string;

  @ApiPropertyOptional({
    description: '추적 id(X-Request-Id). 애플리케이션 로그와 이어 보는 값.',
  })
  readonly requestId!: string | null;

  @ApiPropertyOptional({
    description: '앱 번호. 로그인 전 호출은 이 단위로 묶인다.',
  })
  readonly appId!: number | null;

  @ApiPropertyOptional({ description: '회원번호. 로그인 전이면 없다.' })
  readonly userId!: number | null;

  @ApiProperty({ description: '기능', example: 'hospital-search' })
  readonly feature!: string;

  @ApiProperty({ description: '기준 프롬프트 이름' })
  readonly promptName!: string;

  @ApiProperty({
    description: '프롬프트의 판(sha256 앞 16자). 프롬프트를 고치면 값이 갈린다.',
  })
  readonly promptHash!: string;

  @ApiProperty({ description: 'LLM 업체', example: 'anthropic' })
  readonly provider!: string;

  @ApiProperty({ description: '실제로 답한 모델' })
  readonly model!: string;

  @ApiProperty({ description: '입력 토큰' })
  readonly inputTokens!: number;

  @ApiProperty({ description: '출력 토큰' })
  readonly outputTokens!: number;

  @ApiProperty({ description: '업체 캐시에서 읽은 입력 토큰(정가의 1/10)' })
  readonly cacheReadTokens!: number;

  @ApiProperty({ description: '업체 캐시에 쓴 입력 토큰(정가의 1.25배)' })
  readonly cacheWriteTokens!: number;

  @ApiProperty({
    description: '우리 Redis 캐시에서 나온 답인가. true 면 토큰이 전부 0 이다.',
  })
  readonly cached!: boolean;

  @ApiProperty({ description: '서버가 이 요청을 처리한 시간(ms)' })
  readonly elapsedMs!: number;

  @ApiPropertyOptional({
    description: '업체가 준 요청 id. 업체에 문의할 때 쓰는 값이다.',
  })
  readonly upstreamId!: string | null;

  @ApiProperty({ description: '호출 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(entry: LlmUsageLogEntry) {
    this.id = entry.id;
    this.requestId = entry.requestId;
    this.appId = entry.appId;
    this.userId = entry.userId;
    this.feature = entry.feature;
    this.promptName = entry.promptName;
    this.promptHash = entry.promptHash;
    this.provider = entry.provider;
    this.model = entry.model;
    this.inputTokens = entry.inputTokens;
    this.outputTokens = entry.outputTokens;
    this.cacheReadTokens = entry.cacheReadTokens;
    this.cacheWriteTokens = entry.cacheWriteTokens;
    this.cached = entry.cached;
    this.elapsedMs = entry.elapsedMs;
    this.upstreamId = entry.upstreamId;
    this.createdAt = entry.createdAt.toISOString();
  }
}
