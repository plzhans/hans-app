import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { NmcMirrorHospitalDetail, NmcMirrorListRow } from '@hansapp/admin-application';

import { MirrorSectionDto } from './mirror-section.dto';

/** NMC 병원 미러(nmc_hospital) 목록 조회 조건. healthcare_hospital 과 무관한 검색이다. */
export class NmcMirrorListQueryDto {
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

  @ApiPropertyOptional({ description: '병원명(원본 dutyName) 부분 일치 또는 기관ID 정확 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly keyword?: string;

  @ApiPropertyOptional({ description: '시도명(원본 sidoNm). NMC 는 지역코드가 없다.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  readonly sidoNm?: string;

  @ApiPropertyOptional({ description: '시군구명(원본 sgguNm)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  readonly sgguNm?: string;

  @ApiPropertyOptional({ description: '기관구분(원본 dutyDiv). A=종합병원 B=병원 D=요양병원 등' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  readonly dutyDiv?: string;
}

export class NmcMirrorListItemDto {
  @ApiProperty() readonly hpid!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty({ nullable: true }) readonly addr!: string | null;
  @ApiProperty({ nullable: true }) readonly tel!: string | null;
  @ApiProperty({ nullable: true }) readonly sidoNm!: string | null;
  @ApiProperty({ nullable: true }) readonly sgguNm!: string | null;
  @ApiProperty({ nullable: true }) readonly dutyDiv!: string | null;
  @ApiProperty() readonly syncedAt!: string;

  constructor(row: NmcMirrorListRow) {
    this.hpid = row.hpid;
    this.name = row.name;
    this.addr = row.addr;
    this.tel = row.tel;
    this.sidoNm = row.sidoNm;
    this.sgguNm = row.sgguNm;
    this.dutyDiv = row.dutyDiv;
    this.syncedAt = row.syncedAt;
  }
}

export class NmcMirrorDetailDto {
  @ApiProperty() readonly hpid!: string;
  @ApiProperty({ nullable: true }) readonly name!: string | null;
  @ApiProperty() readonly syncedAt!: string;
  @ApiProperty({ nullable: true, description: '이 기관ID로 만들어진 통합병원 id. 없으면 null.' })
  readonly linkedHealthcareHospitalId!: number | null;
  @ApiProperty({ type: MirrorSectionDto, isArray: true })
  readonly sections!: MirrorSectionDto[];

  constructor(detail: NmcMirrorHospitalDetail) {
    this.hpid = detail.hpid;
    this.name = detail.name;
    this.syncedAt = detail.syncedAt;
    this.linkedHealthcareHospitalId = detail.linkedHealthcareHospitalId;
    this.sections = detail.sections.map((section) => new MirrorSectionDto(section));
  }
}
