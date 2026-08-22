import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { HiraMirrorHospitalDetail, HiraMirrorListRow } from '@hansapp/admin-application';

import { MirrorSectionDto } from './mirror-section.dto';

/** HIRA 병원 미러(hira_hospital) 목록 조회 조건. healthcare_hospital 과 무관한 검색이다. */
export class HiraMirrorListQueryDto {
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

  @ApiPropertyOptional({ description: '병원명(원본 yadmNm) 부분 일치 또는 요양기호 정확 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly keyword?: string;

  @ApiPropertyOptional({ description: '시도코드(원본 sidoCd)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  readonly sidoCd?: string;

  @ApiPropertyOptional({ description: '시군구코드(원본 sgguCd)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  readonly sgguCd?: string;

  @ApiPropertyOptional({ description: '종별코드(원본 clCd)' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  readonly clCd?: string;
}

export class HiraMirrorListItemDto {
  @ApiProperty() readonly ykiho!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty({ nullable: true }) readonly addr!: string | null;
  @ApiProperty({ nullable: true }) readonly tel!: string | null;
  @ApiProperty({ nullable: true }) readonly sidoNm!: string | null;
  @ApiProperty({ nullable: true }) readonly sgguNm!: string | null;
  @ApiProperty({ nullable: true }) readonly clCd!: string | null;
  @ApiProperty() readonly syncedAt!: string;

  constructor(row: HiraMirrorListRow) {
    this.ykiho = row.ykiho;
    this.name = row.name;
    this.addr = row.addr;
    this.tel = row.tel;
    this.sidoNm = row.sidoNm;
    this.sgguNm = row.sgguNm;
    this.clCd = row.clCd;
    this.syncedAt = row.syncedAt;
  }
}

export class HiraMirrorDetailDto {
  @ApiProperty() readonly ykiho!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty() readonly syncedAt!: string;
  @ApiProperty({ nullable: true, description: '이 요양기호로 만들어진 통합병원 id. 없으면 null.' })
  readonly linkedHealthcareHospitalId!: number | null;
  @ApiProperty({ type: MirrorSectionDto, isArray: true })
  readonly sections!: MirrorSectionDto[];

  constructor(detail: HiraMirrorHospitalDetail) {
    this.ykiho = detail.ykiho;
    this.name = detail.name;
    this.syncedAt = detail.syncedAt;
    this.linkedHealthcareHospitalId = detail.linkedHealthcareHospitalId;
    this.sections = detail.sections.map((section) => new MirrorSectionDto(section));
  }
}
