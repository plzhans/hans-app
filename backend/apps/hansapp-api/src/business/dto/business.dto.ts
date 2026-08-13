import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

/** 문자열에서 숫자만 남긴다. '645-64-01820' → '6462401820', '2000-01-01' → '20000101'. */
const digitsOnly = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/\D/g, '') : value;

// ── 요청 ───────────────────────────────────────────────────

/** 경로의 사업자등록번호. `-` 는 자동 제거하고 10자리 숫자만 통과시킨다. */
export class BnoParamDto {
  @ApiProperty({
    description: "사업자등록번호. '-' 는 자동으로 제거된다.",
    example: '6462401820',
  })
  @IsString()
  @Transform(digitsOnly)
  @Matches(/^\d{10}$/, {
    message: '사업자등록번호는 숫자 10자리여야 합니다.',
  })
  readonly bno!: string;
}

/**
 * 진위확인 요청 본문.
 *
 * **개업일자·대표자성명이 필수다.** 국세청은 사업자번호(경로)와 이 둘이 등록정보와 모두
 * 일치해야 유효로 본다. 상호·법인번호 등 선택 항목을 더 넣을수록 판정이 정밀해진다.
 *
 * 대표자성명 등 개인정보를 URL·쿼리가 아니라 **본문**으로 받는다 — 접근 로그에 남지 않게 한다.
 */
export class BusinessVerifyRequestDto {
  @ApiProperty({
    description: "개업일자 (YYYYMMDD). '-' 는 자동 제거된다.",
    example: '20000101',
  })
  @IsString()
  @Transform(digitsOnly)
  @Matches(/^\d{8}$/, {
    message: '개업일자는 YYYYMMDD 8자리여야 합니다.',
  })
  readonly startDate!: string;

  @ApiProperty({ description: '대표자성명', example: '홍길동' })
  @IsString()
  readonly name!: string;

  @ApiPropertyOptional({
    description: '대표자성명2. 대표자성명이 한글이 아닐 때의 한글명.',
  })
  @IsOptional()
  @IsString()
  readonly name2?: string;

  @ApiPropertyOptional({ description: '상호' })
  @IsOptional()
  @IsString()
  readonly companyName?: string;

  @ApiPropertyOptional({
    description: "법인등록번호(13자리). '-' 는 자동 제거.",
  })
  @IsOptional()
  @IsString()
  @Transform(digitsOnly)
  readonly corpNo?: string;

  @ApiPropertyOptional({ description: '사업장주소' })
  @IsOptional()
  @IsString()
  readonly address?: string;
}

// ── 응답 ───────────────────────────────────────────────────

/**
 * 사업자등록 상태.
 *
 * 국세청 원본 코드(b_stt_cd, tax_type_cd)를 그대로 담되 사람이 읽을 이름도 함께 준다.
 * **등록되지 않은 번호도 에러가 아니다** — registered=false 로 오고, taxType 에
 * '국세청에 등록되지 않은 사업자등록번호입니다' 가 담긴다.
 */
export class BusinessStatusDto {
  @ApiProperty({ description: '사업자등록번호', example: '6462401820' })
  readonly bno!: string;

  @ApiProperty({
    description: '국세청에 등록된 사업자인지. false 면 나머지 상태값은 비어 있다.',
    example: true,
  })
  readonly registered!: boolean;

  @ApiPropertyOptional({
    description: '납세자상태 코드. 01:계속사업자 / 02:휴업자 / 03:폐업자',
    example: '01',
  })
  readonly statusCode?: string;

  @ApiPropertyOptional({
    description: '납세자상태 명칭',
    example: '계속사업자',
  })
  readonly status?: string;

  @ApiPropertyOptional({
    description: '과세유형 코드. 01:일반 / 02:간이 / 04:면세 등',
    example: '01',
  })
  readonly taxTypeCode?: string;

  @ApiPropertyOptional({
    description: '과세유형 명칭. 미등록이면 "국세청에 등록되지 않은 사업자등록번호입니다".',
    example: '부가가치세 일반과세자',
  })
  readonly taxType?: string;

  @ApiPropertyOptional({
    description: '폐업일 (YYYYMMDD)',
    example: '20200101',
  })
  readonly closedAt?: string;
}

/**
 * 사업자등록정보 진위확인 결과.
 *
 * valid 가 판정의 핵심이다. status 에는 함께 조회된 상태(계속/휴업/폐업)가 실려 온다.
 */
export class BusinessVerificationDto {
  @ApiProperty({ description: '사업자등록번호', example: '6462401820' })
  readonly bno!: string;

  @ApiProperty({
    description: '진위확인 결과. 입력한 정보가 국세청 등록정보와 일치하면 true.',
    example: true,
  })
  readonly valid!: boolean;

  @ApiPropertyOptional({
    description: '불일치 시 안내 메시지. 일치하면 비어 있다.',
    example: '확인할 수 없습니다.',
  })
  readonly message?: string;

  @ApiPropertyOptional({
    type: BusinessStatusDto,
    description: '함께 조회된 사업자 상태.',
  })
  readonly status?: BusinessStatusDto;
}
