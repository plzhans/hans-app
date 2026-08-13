import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuthLogAction, AuthLogResult } from '@hansapp/admin-application';
import type { AuthLogEntry } from '@hansapp/admin-application';

/**
 * 전역 인증 기록 조회 조건.
 *
 * **기간(`from`)이 필수다.** 대상을 안 가리는 조회라 `(created_at)` 인덱스가 유일한
 * 버팀목이고, 기간이 없으면 표를 통째로 읽는다. 없으면 400 이다.
 */
export class AuthLogQueryDto {
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

  @ApiProperty({
    description: '시작 시각(ISO 8601, 포함). **필수다.**',
    example: '2026-08-03T00:00:00.000Z',
  })
  @IsISO8601()
  readonly from!: string;

  @ApiPropertyOptional({
    description: '종료 시각(ISO 8601, 포함). 없으면 지금까지.',
  })
  @IsOptional()
  @IsISO8601()
  readonly to?: string;

  @ApiPropertyOptional({
    description: '볼 액션. 쉼표로 여러 개(`LOGIN,LOGOUT`). 없으면 전부.',
    enum: AuthLogAction,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    // 없을 때 손대지 않는다 — 배열을 만들어 돌려주면 @IsOptional 이 건너뛸 기회를 잃는다.
    if (value == null) return undefined;
    const parsed = (Array.isArray(value) ? value : [value])
      .flatMap((item: unknown) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    return parsed.length ? parsed : undefined;
  })
  @IsEnum(AuthLogAction, { each: true })
  readonly actions?: AuthLogAction[];

  @ApiPropertyOptional({ description: '결과', enum: AuthLogResult })
  @IsOptional()
  @IsEnum(AuthLogResult)
  readonly result?: AuthLogResult;

  @ApiPropertyOptional({ description: '접속 IP 정확 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  readonly ip?: string;

  @ApiPropertyOptional({ description: '회원번호' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  readonly userId?: number;

  @ApiPropertyOptional({
    description: '회원 이메일. 서버가 회원번호로 바꿔 조회한다. 그런 회원이 없으면 빈 결과다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  readonly userEmail?: string;

  @ApiPropertyOptional({
    description:
      '회원이 특정되지 않은 기록만. **없는 계정으로의 로그인 시도가 여기 걸린다** — ' +
      '어느 회원에도 안 붙어 회원 상세에서는 보이지 않는 행이다.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : undefined))
  @IsBoolean()
  readonly anonymousOnly?: boolean;
}

/** 인증 기록 한 줄. */
export class AuthLogDto {
  @ApiProperty({ description: '로그 식별자. BigInt 라 문자열로 준다.' })
  readonly id!: string;

  @ApiPropertyOptional({
    description: '회원번호. 회원이 특정되지 않으면 없다.',
  })
  readonly userId!: number | null;

  @ApiPropertyOptional({
    description:
      '회원 이메일. 로그 표에는 없는 값이라 메인 DB 에서 붙인다. 이미 지워진 회원이면 없다.',
  })
  readonly userEmail!: string | null;

  @ApiProperty({ description: '이벤트 종류', enum: AuthLogAction })
  readonly action!: AuthLogAction;

  @ApiProperty({ description: '결과', enum: AuthLogResult })
  readonly result!: AuthLogResult;

  @ApiPropertyOptional({ description: '로그인·가입·연동에 쓴 수단' })
  readonly provider!: string | null;

  @ApiPropertyOptional({ description: '실패 사유. 성공이면 없다.' })
  readonly failReason!: string | null;

  @ApiPropertyOptional({ description: '접속 IP' })
  readonly ip!: string | null;

  @ApiPropertyOptional({ description: '접속 기기 정보' })
  readonly userAgent!: string | null;

  @ApiPropertyOptional({
    description: '액션별 부가정보. 모양이 액션마다 다르고, 없으면 빠진다.',
    type: 'object',
    additionalProperties: true,
  })
  readonly detail!: unknown;

  @ApiProperty({ description: '발생 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(entry: AuthLogEntry) {
    this.id = entry.id;
    this.userId = entry.userId;
    this.userEmail = entry.userEmail;
    this.action = entry.action;
    this.result = entry.result;
    this.provider = entry.provider;
    this.failReason = entry.failReason;
    this.ip = entry.ip;
    this.userAgent = entry.userAgent;
    this.detail = entry.detail;
    this.createdAt = entry.createdAt.toISOString();
  }
}
