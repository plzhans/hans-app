import { ApiProperty } from '@nestjs/swagger';
import type {
  HospitalMeta,
  HospitalMetaOption,
  HospitalMetaRegion,
} from '@hansapp/admin-application';

export class HospitalMetaOptionDto {
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly name!: string;

  constructor(row: HospitalMetaOption) {
    this.code = row.code;
    this.name = row.name;
  }
}

export class HospitalMetaRegionDto {
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ nullable: true }) readonly shortName!: string | null;
  @ApiProperty({ description: 'sido | sggu' }) readonly level!: string;
  @ApiProperty({ nullable: true, description: '시군구면 시도 코드' }) readonly parentCode!:
    string | null;

  constructor(row: HospitalMetaRegion) {
    this.code = row.code;
    this.name = row.name;
    this.shortName = row.shortName;
    this.level = row.level;
    this.parentCode = row.parentCode;
  }
}

/** 검색 필터에 쓰는 코드 이름표 한 벌. 값이 자주 바뀌지 않아 프론트가 오래 캐시해도 된다. */
export class HospitalMetaDto {
  @ApiProperty({ type: HospitalMetaOptionDto, isArray: true })
  readonly classes!: HospitalMetaOptionDto[];
  @ApiProperty({ type: HospitalMetaOptionDto, isArray: true })
  readonly subjects!: HospitalMetaOptionDto[];
  @ApiProperty({ type: HospitalMetaOptionDto, isArray: true })
  readonly equipments!: HospitalMetaOptionDto[];
  @ApiProperty({ type: HospitalMetaOptionDto, isArray: true })
  readonly specialties!: HospitalMetaOptionDto[];
  @ApiProperty({ type: HospitalMetaOptionDto, isArray: true })
  readonly specials!: HospitalMetaOptionDto[];
  @ApiProperty({ type: HospitalMetaOptionDto, isArray: true })
  readonly assessments!: HospitalMetaOptionDto[];
  @ApiProperty({ type: HospitalMetaRegionDto, isArray: true })
  readonly regions!: HospitalMetaRegionDto[];

  constructor(row: HospitalMeta) {
    this.classes = row.classes.map((r) => new HospitalMetaOptionDto(r));
    this.subjects = row.subjects.map((r) => new HospitalMetaOptionDto(r));
    this.equipments = row.equipments.map((r) => new HospitalMetaOptionDto(r));
    this.specialties = row.specialties.map((r) => new HospitalMetaOptionDto(r));
    this.specials = row.specials.map((r) => new HospitalMetaOptionDto(r));
    this.assessments = row.assessments.map((r) => new HospitalMetaOptionDto(r));
    this.regions = row.regions.map((r) => new HospitalMetaRegionDto(r));
  }
}
