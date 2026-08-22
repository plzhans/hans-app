import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { HospitalAdminEngine, HospitalAdminRow } from '@hansapp/admin-application';

/** 쉼표로 이어 온 코드 목록 → 배열. 없으면 손대지 않는다(@IsOptional 이 건너뛸 수 있게). */
function toCodeArray({ value }: { value: unknown }): string[] | undefined {
  if (value == null) return undefined;
  const parsed = (Array.isArray(value) ? value : [value])
    .flatMap((item: unknown) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : undefined;
}

/**
 * 관리자 병원 목록 조회 조건.
 *
 * **engine 이 쓸 수 있는 필드를 가른다.** db(기본)는 keyword·status·classCd·regionCd 만
 * 본다 — 그 밖의 필드를 실으면 서버가 400(ADMIN_QUERY_UNSUPPORTED)을 준다. es 는 여기에
 * 더해 진료과목·장비 등 상세 코드 필터를 쓸 수 있지만, 색인엔 활성 병원만 있어 status 는
 * 비우거나 'active' 만 된다.
 */
export class HospitalAdminListQueryDto {
  @ApiPropertyOptional({
    description: '조회 저장소. db=DB(전체 상태, 최소조건) · es=검색색인(활성만, 상세조건)',
    enum: ['db', 'es'],
    default: 'db',
  })
  @IsOptional()
  @IsIn(['db', 'es'])
  readonly engine: HospitalAdminEngine = 'db';

  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ description: '페이지 크기', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly size: number = 20;

  @ApiPropertyOptional({ description: '병원명·법인명·요양기호·기관ID 부분 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly keyword?: string;

  @ApiPropertyOptional({
    description:
      "상태. db 는 값 그대로 건다(예: 'active'·'closed'). es 는 비우거나 'active' 만 된다 — " +
      '색인엔 활성 병원만 있다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  readonly status?: string;

  @ApiPropertyOptional({ description: '종별 코드(healthcare_code tp=class)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  readonly classCd?: string;

  @ApiPropertyOptional({ description: '시군구 코드(region_code)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  readonly regionCd?: string;

  @ApiPropertyOptional({ description: '[es 전용] 등급 코드. 쉼표로 여러 개.', isArray: true })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly tier?: string[];

  @ApiPropertyOptional({ description: '[es 전용] 응급실 운영' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  readonly emergency?: boolean;

  @ApiPropertyOptional({ description: '[es 전용] 달빛어린이병원' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  readonly baby?: boolean;

  @ApiPropertyOptional({ description: '[es 전용] 진료과목 코드. 쉼표로 여러 개.', isArray: true })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly subjectCds?: string[];

  @ApiPropertyOptional({
    description: '[es 전용] 전문의 보유 진료과목 코드. 쉼표로 여러 개.',
    isArray: true,
  })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly specialistCds?: string[];

  @ApiPropertyOptional({ description: '[es 전용] 보유장비 코드. 쉼표로 여러 개.', isArray: true })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly equipmentCds?: string[];

  @ApiPropertyOptional({
    description: '[es 전용] 전문병원 지정분야 코드. 쉼표로 여러 개.',
    isArray: true,
  })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly specialtyCds?: string[];

  @ApiPropertyOptional({ description: '[es 전용] 특수진료 코드. 쉼표로 여러 개.', isArray: true })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly specialCds?: string[];

  @ApiPropertyOptional({
    description: '[es 전용] 적정성평가 우수(1등급) 항목 코드. 쉼표로 여러 개.',
    isArray: true,
  })
  @IsOptional()
  @Transform(toCodeArray)
  @IsString({ each: true })
  readonly asmExcellentCds?: string[];
}

/** 목록 한 줄. 상세 화면 없이 이 값만으로 확인·검색이 되게 최소 식별 정보를 담는다. */
export class HospitalAdminListItemDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly legalName!: string;
  @ApiProperty({ description: "예: 'active'·'closed'" }) readonly status!: string;
  @ApiProperty({ description: 'hira_nmc·hira·nmc·manual' }) readonly source!: string;
  @ApiProperty({ nullable: true }) readonly ykiho!: string | null;
  @ApiProperty({ nullable: true }) readonly hpid!: string | null;
  @ApiProperty({ nullable: true }) readonly classCd!: string | null;
  @ApiProperty({ nullable: true }) readonly regionCd!: string | null;
  @ApiProperty({ nullable: true }) readonly tier!: string | null;
  @ApiProperty({ nullable: true }) readonly addr!: string | null;
  @ApiProperty({ nullable: true }) readonly tel!: string | null;

  constructor(row: HospitalAdminRow) {
    this.id = row.id;
    this.name = row.name;
    this.legalName = row.legalName;
    this.status = row.status;
    this.source = row.source;
    this.ykiho = row.ykiho;
    this.hpid = row.hpid;
    this.classCd = row.classCd;
    this.regionCd = row.regionCd;
    this.tier = row.tier;
    this.addr = row.addr;
    this.tel = row.tel;
  }
}
