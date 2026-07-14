import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from '@hansapi/application';

/**
 * 통합 병원 검색 조건.
 *
 * 코드는 전부 **우리 코드**다. 원본(HIRA/NMC) 코드가 아니다.
 * 목록은 /healthcare/meta/* 에서 받는다.
 */
export class HospitalSearchRequestDto {
  @ApiPropertyOptional({ description: '페이지 번호', default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: DEFAULT_PAGE_SIZE,
    minimum: MIN_PAGE_SIZE,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE_SIZE)
  @Max(MAX_PAGE_SIZE)
  readonly size: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description: '시군구 코드. /regions 참조',
    example: '11001',
  })
  @IsOptional()
  @IsString()
  readonly region?: string;

  @ApiPropertyOptional({
    description:
      '종별 코드. 쉼표로 여러 개(OR). /healthcare/meta/classes 참조.',
    example: 'CLINIC,HOSPITAL',
  })
  @IsOptional()
  @IsString()
  readonly category?: string;

  @ApiPropertyOptional({
    description:
      '병원 등급. TIER1(의원급) | TIER2(병원급) | TIER3(상급종합) | NURSING | MENTAL. ' +
      '쉼표로 여러 개(OR).\n\n' +
      '**비워두면 NURSING·MENTAL 이 빠진다** — 장기 입원 시설이라 외래 검색에 섞이면 방해다. ' +
      '`tier=NURSING` 으로 지정하면 나온다.\n\n' +
      '/healthcare/meta/tiers 참조.',
    example: 'TIER1',
  })
  @IsOptional()
  @IsString()
  readonly tier?: string;

  @ApiPropertyOptional({
    description:
      '진료과목 코드. 쉼표로 여러 개(OR). /healthcare/meta/subjects 참조.\n\n' +
      '진료 분야 그룹(치과·한방 등)은 /healthcare/meta/subject-groups 에서 받아 ' +
      '**코드로 펼쳐서** 넘긴다. 이 API 는 그룹을 모른다.',
    example: 'DENT,ORTHO,PERIO',
  })
  @IsOptional()
  @IsString()
  readonly subject?: string;

  @ApiPropertyOptional({ description: '병원명 (부분 일치)' })
  @IsOptional()
  @IsString()
  readonly name?: string;

  @ApiPropertyOptional({ description: '응급실 운영 병원만', example: 'true' })
  @IsOptional()
  @IsBooleanString()
  readonly emergency?: string;

  @ApiPropertyOptional({
    description: '달빛어린이병원만 (야간·휴일 소아진료)',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  readonly baby?: string;
}

// ── 응답 ───────────────────────────────────────────────────

export class CodeDto {
  @ApiProperty({ type: String, example: 'TERTIARY' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '상급종합병원' })
  readonly name!: string;
}

/**
 * 병원에 붙어 나오는 지역. **지역 목록(/regions)의 RegionDto 와 다른 타입이다.**
 *
 * 이름을 RegionDto 로 두면 안 된다. Swagger 는 클래스 이름으로 스키마 이름을 만들어서,
 * 같은 이름이 둘이면 components.schemas 의 한 자리를 놓고 충돌한다. 나중에 등록된 쪽이 이기고
 * 병원 응답의 스키마가 통째로 거짓말이 된다(실제로 그렇게 깨져 있었다 — 이 응답엔 sido 가
 * 있는데 스펙에는 없어서, 생성된 클라이언트가 sido 를 모르는 상태였다).
 *
 * 모양이 다른 이유는 쓰임이 달라서다. 이건 화면에 주소를 찍기 위한 것이라 시도를 품고 있고,
 * 지역 목록은 검색 조건을 고르기 위한 것이라 level·parentCode 로 계층을 표현한다.
 */
export class HospitalRegionDto {
  @ApiProperty({ type: String, example: '11001' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '강남구' })
  readonly name!: string;

  @ApiPropertyOptional({ type: CodeDto, description: '시도' })
  readonly sido?: CodeDto;

  @ApiPropertyOptional({
    type: String,
    description: '읍면동. 코드가 없어 이름 그대로다.',
  })
  readonly emdong?: string;
}

export class LocationDto {
  @ApiPropertyOptional({
    type: String,
    example: '혜화역',
    description:
      '가장 가까운 지하철역. 교통정보의 첫 지하철 항목에서 뽑는다.\n' +
      '**거리는 따지지 않는다** — 원본이 거리("500m")와 소요시간("도보 5분")을 같은 칸에 ' +
      '섞어 쓰고 비워두기도 해서, 걸러내면 멀쩡한 역세권 병원이 대거 빠진다. ' +
      '정확한 거리는 상세의 transport 를 봐라.',
  })
  readonly station?: string;

  @ApiPropertyOptional({ type: String })
  readonly address?: string;

  @ApiPropertyOptional({ type: String })
  readonly postNo?: string;

  @ApiPropertyOptional({ type: HospitalRegionDto })
  readonly region?: HospitalRegionDto;

  @ApiPropertyOptional({ type: Number, example: 37.4923 })
  readonly lat?: number;

  @ApiPropertyOptional({ type: Number, example: 127.0292 })
  readonly lon?: number;
}

export class HospitalSummaryDto {
  @ApiProperty({ type: Number, description: '통합 병원 id' })
  readonly id!: number;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiPropertyOptional({
    type: CodeDto,
    description: '종별. 의원·종합병원·치과의원 …',
  })
  readonly category?: CodeDto;

  @ApiPropertyOptional({
    type: CodeDto,
    description:
      '병원 등급. TIER1(의원급) | TIER2(병원급) | TIER3(상급종합) | NURSING | MENTAL.\n' +
      '종별에서 유도한 값이다 — 의료법이 병상 수로 종별을 규정하므로 등급이 종별에 이미 들어 있다.',
  })
  readonly tier?: CodeDto;

  @ApiProperty({ type: LocationDto })
  readonly location!: LocationDto;

  @ApiPropertyOptional({ type: String })
  readonly tel?: string;

  @ApiProperty({ type: Boolean, description: '응급실 운영' })
  readonly emergency!: boolean;

  @ApiProperty({
    type: Boolean,
    description: '달빛어린이병원 (야간·휴일 소아진료)',
  })
  readonly baby!: boolean;
}

export class SourcesDto {
  @ApiPropertyOptional({
    type: String,
    description: 'HIRA 요양기호. 원본을 직접 확인할 때만 쓴다.',
  })
  readonly ykiho?: string;

  @ApiPropertyOptional({ type: String, description: 'NMC 기관ID' })
  readonly hpid?: string;
}

export class SubjectDto {
  @ApiProperty({ type: String, example: 'IM' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '내과' })
  readonly name!: string;

  @ApiProperty({
    type: Boolean,
    description: '신고한 과목인가. **진료과목** 판정 기준이다.',
  })
  readonly declared!: boolean;

  @ApiPropertyOptional({
    type: Number,
    description:
      '과목별 의사수. **겸직이 중복 계산된다. 합산하지 마라** — 총원은 staff.doctorTotal 이다.',
  })
  readonly doctorCount?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      '과목별 전문의수. 0보다 크면 **표시과목**이다. 상세 수집이 끝난 병원만 값이 있다.',
  })
  readonly specialistCount?: number;
}

export class HoursDto {
  @ApiProperty({
    type: String,
    description:
      'general(일반 진료) | baby(달빛어린이). **시간대가 다르다** — 달빛은 야간에 소아만 받는다.',
    example: 'general',
  })
  readonly kind!: string;

  @ApiProperty({ type: Number, description: '1~7 = 월~일, 8 = 공휴일' })
  readonly day!: number;

  @ApiPropertyOptional({ type: String, example: '0900' })
  readonly open?: string;

  @ApiPropertyOptional({ type: String, example: '1800' })
  readonly close?: string;

  @ApiPropertyOptional({ type: String })
  readonly breakStart?: string;

  @ApiPropertyOptional({ type: String })
  readonly breakEnd?: string;
}

export class StaffDto {
  @ApiPropertyOptional({
    type: Number,
    description: '총 의사수. 중복 없는 실제 인원이다.',
  })
  readonly doctorTotal?: number;

  @ApiPropertyOptional({ type: Number })
  readonly specialist?: number;

  @ApiPropertyOptional({ type: Number })
  readonly resident?: number;

  @ApiPropertyOptional({ type: Number })
  readonly intern?: number;

  @ApiPropertyOptional({ type: Number })
  readonly generalDoctor?: number;

  @ApiPropertyOptional({ type: Number })
  readonly dentist?: number;

  @ApiPropertyOptional({ type: Number })
  readonly oriental?: number;

  @ApiPropertyOptional({ type: Number })
  readonly midwife?: number;
}

export class BedsDto {
  @ApiPropertyOptional({ type: Number, description: '허가 병상수' })
  readonly total?: number;

  @ApiPropertyOptional({ type: Number })
  readonly standard?: number;

  @ApiPropertyOptional({ type: Number })
  readonly higher?: number;

  @ApiPropertyOptional({ type: Number, description: '중환자실' })
  readonly icu?: number;

  @ApiPropertyOptional({ type: Number, description: '응급실 병상' })
  readonly emergency?: number;

  @ApiPropertyOptional({ type: Number })
  readonly operatingRoom?: number;

  @ApiPropertyOptional({ type: Number })
  readonly delivery?: number;

  @ApiPropertyOptional({ type: Number })
  readonly neonatal?: number;

  @ApiPropertyOptional({ type: Number, description: '음압 격리' })
  readonly isolation?: number;

  @ApiPropertyOptional({ type: Number })
  readonly psyOpen?: number;

  @ApiPropertyOptional({ type: Number })
  readonly psyClosed?: number;
}

export class EquipmentDto {
  @ApiProperty({ type: String, example: 'CT' })
  readonly code!: string;

  @ApiProperty({ type: String, example: 'CT' })
  readonly name!: string;

  @ApiPropertyOptional({ type: Number, description: '보유 대수' })
  readonly count?: number;
}

export class CapabilityDto {
  @ApiProperty({
    type: String,
    description: 'severe(중증처치) | specialty(전문병원) | special(특수진료)',
    example: 'severe',
  })
  readonly type!: string;

  @ApiProperty({ type: String, example: 'BRAIN_HEMO' })
  readonly code!: string;

  @ApiPropertyOptional({ type: String, example: '뇌출혈수술' })
  readonly name?: string;
}

export class ParkingDto {
  @ApiPropertyOptional({ type: Number, description: '주차 가능대수' })
  readonly capacity?: number;

  @ApiPropertyOptional({ type: Boolean, description: '유료 여부' })
  readonly paid?: boolean;

  @ApiPropertyOptional({ type: String })
  readonly note?: string;
}

/**
 * 교통편 하나.
 *
 * 원본(HIRA)에 코드가 없다. 전부 병원이 적은 문자열이라 **가공하지 말고 그대로 표시**하라 —
 * 필드 이름과 실제 내용이 어긋나는 것이 있다(dir, distance).
 */
export class TransportRouteDto {
  @ApiPropertyOptional({
    type: String,
    example: '시내버스',
    description: '교통편 원문. 화면 표기에 쓴다',
  })
  readonly kindName?: string;

  @ApiPropertyOptional({
    type: String,
    example: '36,39 번',
    description: '노선. 여러 노선이 한 문자열로 오기도 한다',
  })
  readonly line?: string;

  @ApiPropertyOptional({
    type: String,
    example: '기장시장or부산은행앞',
    description: '하차지점',
  })
  readonly arrival?: string;

  @ApiPropertyOptional({
    type: String,
    example: '마을버스11번 or 택시이용',
    description: '이름은 방향이지만 실제로는 이용 안내가 온다',
  })
  readonly dir?: string;

  @ApiPropertyOptional({
    type: String,
    example: '5분~10분 소요',
    description: '거리 **또는 소요시간**. 단위가 제각각이라 계산하지 마라',
  })
  readonly distance?: string;

  @ApiPropertyOptional({ type: String, example: '병원 셔틀버스 이용' })
  readonly note?: string;
}

/**
 * 교통편. 수단별로 묶여 있다.
 *
 * **"대중교통" 이 아니다** — etc 에 자가용·기차가 섞여 온다.
 * 찾아오는 길(directions)과도 별개다. 하나는 병원이 쓴 문장, 이건 심평원이 준 표다.
 */
export class TransportDto {
  @ApiProperty({ type: [TransportRouteDto] })
  readonly subway!: TransportRouteDto[];

  @ApiProperty({
    type: [TransportRouteDto],
    description: '시내·마을·시외/고속버스가 모두 들어온다. 구분은 kindName',
  })
  readonly bus!: TransportRouteDto[];

  @ApiProperty({
    type: [TransportRouteDto],
    description: '자가용·기차·기타. 대중교통이 아닌 것도 있다',
  })
  readonly etc!: TransportRouteDto[];
}

export class HospitalDetailDto extends HospitalSummaryDto {
  @ApiProperty({ type: SourcesDto })
  readonly sources!: SourcesDto;

  @ApiPropertyOptional({ type: String })
  readonly homepage?: string;

  @ApiPropertyOptional({ type: String, description: '개설일자 (YYYYMMDD)' })
  readonly establishedAt?: string;

  @ApiPropertyOptional({
    type: String,
    description: '병원 소개·진료 안내',
  })
  readonly intro?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      '기타 안내. **구조화된 진료시간이 못 담는 예외**가 자유 텍스트로 온다 — ' +
      '"접수시간: 평일 08:30~17:00", "신정·구정·추석 당일 휴진" 등.',
  })
  readonly notice?: string;

  @ApiPropertyOptional({
    type: String,
    description: '찾아오는 길. 병원이 쓴 문장이다. transport 와 별개다',
  })
  readonly directions?: string;

  @ApiProperty({
    type: TransportDto,
    description: '교통편. 없으면 빈 목록이 담긴 객체다',
  })
  readonly transport!: TransportDto;

  @ApiPropertyOptional({ type: ParkingDto })
  readonly parking?: ParkingDto;

  @ApiProperty({ type: [SubjectDto] })
  readonly subjects!: SubjectDto[];

  @ApiProperty({ type: [HoursDto] })
  readonly hours!: HoursDto[];

  @ApiPropertyOptional({ type: StaffDto })
  readonly staff?: StaffDto;

  @ApiPropertyOptional({ type: BedsDto, description: '규모기관만 있다' })
  readonly beds?: BedsDto;

  @ApiProperty({ type: [EquipmentDto] })
  readonly equipments!: EquipmentDto[];

  @ApiProperty({ type: [CapabilityDto] })
  readonly capabilities!: CapabilityDto[];
}
