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
  DEFAULT_NEARBY_SIZE,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_NEARBY_RADIUS,
  MAX_NEARBY_SIZE,
  MAX_PAGE_SIZE,
  MIN_NEARBY_RADIUS,
  MIN_NEARBY_SIZE,
  MIN_PAGE_SIZE,
} from '@hansapp/application';

/**
 * 통합 병원 검색 **필터**(페이지·스크롤 공통).
 *
 * 코드는 전부 **우리 코드**다. 원본(HIRA/NMC) 코드가 아니다.
 * 목록은 /healthcare/meta/* 에서 받는다.
 *
 * 페이지네이션(HospitalSearchRequestDto)과 무한 스크롤(HospitalScrollRequestDto)이
 * 이 필터를 그대로 물려받고 커서 필드만 각자 얹는다 — 필터를 한 곳에서만 고치면 된다.
 */
export class HospitalFilterRequestDto {
  @ApiPropertyOptional({
    description: '시군구 코드. /address/regions 참조',
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

  @ApiPropertyOptional({
    description:
      '전문의 있는 과목 코드. 쉼표로 여러 개(OR). subject 와 같은 진료과목 코드지만 ' +
      '**그 과목 전문의를 실제로 보유한** 병원만 건다(subject 는 신고만 하면 걸림). ' +
      '옵션 목록은 /healthcare/meta/subjects 의 specialist=true 인 과목.',
    example: 'IM,ORTHO',
  })
  @IsOptional()
  @IsString()
  readonly specialist?: string;

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

  @ApiPropertyOptional({
    description:
      '건강보험심사평가원 적정성평가 **항목 코드**(원본 asmGrd 번호). 그 항목에서 1등급(우수)인 병원. ' +
      '쉼표로 여러 개(OR). 코드·분야 목록은 /healthcare/meta/assessments 참조 ' +
      '(예: 12=대장암, 01=급성기뇌졸중, 20=신생아중환자실).\n\n' +
      '**병원급 이상만 의미가 있다** — 의원은 이 항목을 평가받지 않는다.',
    example: '12,13,14,15',
  })
  @IsOptional()
  @IsString()
  readonly assessment?: string;

  @ApiPropertyOptional({
    description:
      '전문병원 지정분야 코드. 쉼표로 여러 개(OR). /healthcare/meta/specialties 참조.',
    example: 'SPINE,JOINT',
  })
  @IsOptional()
  @IsString()
  readonly specialty?: string;

  @ApiPropertyOptional({
    description:
      '특수진료 코드. 쉼표로 여러 개(OR). /healthcare/meta/specials 참조.',
  })
  @IsOptional()
  @IsString()
  readonly special?: string;

  @ApiPropertyOptional({
    description:
      '보유장비 코드. 쉼표로 여러 개(OR). /healthcare/meta/equipments 참조.',
    example: 'CT,MRI',
  })
  @IsOptional()
  @IsString()
  readonly equipment?: string;
}

/**
 * 페이지네이션 검색 조건. 필터(HospitalFilterRequestDto) + page/size(offset).
 * 총건수·총페이지가 필요한 화면(페이지 번호 UI)이 쓴다.
 */
export class HospitalSearchRequestDto extends HospitalFilterRequestDto {
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
}

/**
 * 무한 스크롤 조건. 필터(HospitalFilterRequestDto) + nextToken 커서.
 *
 * page 가 없다 — 스크롤은 페이지 번호로 점프하지 않고 nextToken 으로 이어 받는다.
 */
export class HospitalScrollRequestDto extends HospitalFilterRequestDto {
  @ApiPropertyOptional({
    description:
      '이어받기 커서. **직전 응답의 nextToken 을 그대로** 실어 보낸다. ' +
      '비우면 처음부터다. 값은 불투명 문자열이니 클라이언트가 해석하지 마라.',
  })
  @IsOptional()
  @IsString()
  readonly nextToken?: string;

  @ApiPropertyOptional({
    description: '한 번에 가져올 개수',
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
    description:
      '**원천 선택(테스트용).** 기본은 Elasticsearch 검색이고, `true` 면 DB 로 조회한다. ' +
      'ES 장애 환경에서 DB 로 우회하려고 둔 스위치다 — 평상시엔 지정하지 마라.\n\n' +
      '**nextToken 은 원천마다 형식이 다르다**(DB↔ES 호환 안 됨). 스크롤 도중 db 값을 바꾸면 ' +
      '커서가 맞지 않으니, 한 스크롤 세션 안에서는 db 를 고정해라.',
    example: 'false',
  })
  @IsOptional()
  @IsBooleanString()
  readonly db?: string;
}

/**
 * 근처 유사 병원 조회 조건.
 *
 * **검색 필터가 없다** — 무엇과 비슷한지는 사용자가 고르는 게 아니라 경로의 기준 병원이 정한다.
 * 반경과 개수만 받는다.
 */
export class HospitalNearbyRequestDto {
  @ApiPropertyOptional({
    description:
      '반경(미터). **웬만하면 비워라** — 비우면 서버가 기준 병원의 등급을 보고 정한다.\n\n' +
      '"근처" 의 크기가 등급마다 다르기 때문이다. 의원은 걸어갈 곳을 찾는 자리라 1km 면 되지만 ' +
      '(같은 등급 다섯 곳이 잡히는 거리가 중앙값 75m 다), 상급종합은 전국에 47곳뿐이라 ' +
      '서로 중앙값 38.7km 떨어져 있다 — 좁게 잡으면 **서로를 아예 못 찾는다.**\n\n' +
      '```\n' +
      '의원급    1km      병원급   5km     상급종합  80km\n' +
      '요양병원  15km     정신병원 30km\n' +
      '```\n\n' +
      '값을 주면 그 값이 이긴다. **어느 쪽이든 실제 적용값은 응답의 radius 에 실려 온다** — ' +
      '화면에 "반경 N 안에서" 를 쓰려면 요청값이 아니라 그 값을 봐라.',
    minimum: MIN_NEARBY_RADIUS,
    maximum: MAX_NEARBY_RADIUS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_NEARBY_RADIUS)
  @Max(MAX_NEARBY_RADIUS)
  readonly radius?: number;

  @ApiPropertyOptional({
    description:
      '개수. 상세 하단 섹션은 기본 5개면 충분하다.\n\n' +
      '**이어받기(커서)가 없다.** "더 보기" 가 필요하면 size 를 키워 다시 불러라 — ' +
      '앞 항목이 중복되지만 클라이언트가 교체하면 된다. 채점 비용은 반경이 정하지 size 가 ' +
      '정하지 않아서, 커서를 두어도 서버가 아끼는 게 없다.',
    default: DEFAULT_NEARBY_SIZE,
    minimum: MIN_NEARBY_SIZE,
    maximum: MAX_NEARBY_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_NEARBY_SIZE)
  @Max(MAX_NEARBY_SIZE)
  readonly size: number = DEFAULT_NEARBY_SIZE;
}

// ── 응답 ───────────────────────────────────────────────────

export class CodeDto {
  @ApiProperty({ type: String, example: 'TERTIARY' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '상급종합병원' })
  readonly name!: string;
}

/**
 * 병원에 붙어 나오는 지역. **지역 목록(/address/regions)의 RegionDto 와 다른 타입이다.**
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

  @ApiPropertyOptional({
    type: String,
    example: '2호선',
    description:
      'station 이 어느 노선인가. **같은 항목(subway[0])에서 뽑으므로** 역과 어긋나지 않는다.\n' +
      '원문 그대로다 — "2호선" 뿐 아니라 "1,4호선", "인천지하철1호선" 처럼 오기도 한다. ' +
      '노선색·표기 정규화는 화면이 한다.',
  })
  readonly stationLine?: string;

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

  @ApiPropertyOptional({
    type: CodeDto,
    description:
      '전문병원 지정분야(관절·척추·심장 …). 보건복지부 지정이라 병원당 최대 1건이다.',
  })
  readonly specialty?: CodeDto;

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

/** 기준 병원과 겹친 진료과목 하나. */
export class MatchedSubjectDto {
  @ApiProperty({ type: String, example: 'ORTHO' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '정형외과' })
  readonly name!: string;

  @ApiProperty({
    type: Boolean,
    description:
      '기준 병원과 이 병원이 **둘 다** 그 과 전문의를 보유하는가.\n\n' +
      '신고만 한 과목과 전문의가 실제 있는 과목은 대체재로서 무게가 다르다. ' +
      '배지를 진하게 칠하는 식으로 쓰면 되고, 무시해도 그만이다.',
  })
  readonly specialist!: boolean;
}

/**
 * 근처의 유사한 병원 한 건.
 *
 * **검색 결과(HospitalSummaryDto)와 같은 모양에 두 필드만 얹었다** — 목록 카드를 그대로
 * 재사용하라는 뜻이다.
 */
export class HospitalNearbyDto extends HospitalSummaryDto {
  @ApiProperty({
    type: Number,
    example: 420,
    description:
      '기준 병원으로부터의 **직선거리(m)**. 도로 거리도 소요시간도 아니다 — ' +
      '"420m" 처럼 대략의 가까움을 보여주는 용도다.',
  })
  readonly distance!: number;

  @ApiProperty({
    type: MatchedSubjectDto,
    isArray: true,
    description:
      '기준 병원과 겹친 진료과목. **이 병원이 위에 뜬 이유**이자 화면 배지 재료다.\n\n' +
      '**빈 배열일 수 있다** — 겹치는 과목이 없어도 반경 안이면 거리순으로 채운다. ' +
      '섹션이 통째로 비는 것보다 낫다는 판단이니, 비면 배지만 안 그리면 된다.',
  })
  readonly matchedSubjects!: MatchedSubjectDto[];
}

/** 근처 유사 병원 목록. */
export class HospitalNearbyResponseDto {
  @ApiProperty({
    type: Number,
    example: 1000,
    description:
      '이 결과를 만든 반경(m). 요청에 radius 가 있었으면 그 값, 없었으면 **기준 병원 등급으로 ' +
      '서버가 고른 값**이다. 화면에 "반경 N 안에서" 를 쓸 거면 이 값을 써라.',
  })
  readonly radius!: number;

  @ApiProperty({ type: HospitalNearbyDto, isArray: true })
  readonly items!: HospitalNearbyDto[];
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

export class AssessmentItemDto {
  @ApiProperty({
    type: String,
    description: '심평원 평가항목 번호',
    example: '01',
  })
  readonly code!: string;

  @ApiProperty({
    type: String,
    description:
      '항목명. 요청 언어(Accept-Language)로 온다. 번역이 없으면 한국어로 폴백한다.\n\n' +
      '**심평원 공식 번역이 아니라 우리가 붙인 표시용 이름이다** — 심평원은 한국어만 준다.',
    example: '급성기뇌졸중',
  })
  readonly name!: string;

  @ApiProperty({
    type: String,
    description:
      "등급. 원본 그대로다. **1 이 가장 좋고 5 가 가장 나쁘다.** '등급제외' 는 평가는 했으나 등급을 안 매긴 것이다(평가대상이 아닌 항목은 아예 목록에 없다 — 둘은 다르다).\n\n**천식(code='16')만 인코딩이 다르다** — 1등급을 '양호' 로, 등급제외를 '0' 으로 준다. 그래서 이 값을 숫자로 파싱해 정렬하면 안 된다. 비교는 normalized 를 써라.",
    example: '1',
  })
  readonly grade!: string;

  @ApiProperty({
    oneOf: [{ type: 'integer' }, { type: 'string' }],
    description:
      "등급을 항목 간 비교 가능하게 옮긴 값. 1~5 또는 'X'(등급대상 제외). 천식의 '양호'→1, '0'→'X' 가 여기서 흡수된다.",
    example: 1,
  })
  readonly normalized!: number | 'X';
}

export class AssessmentGroupDto {
  @ApiProperty({ type: String, example: 'asm01' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '급성질환' })
  readonly name!: string;

  @ApiProperty({ type: [AssessmentItemDto] })
  readonly items!: AssessmentItemDto[];
}

export class AssessmentDto {
  @ApiProperty({
    type: [AssessmentGroupDto],
    description:
      '그룹별 평가 결과. 심평원 홈페이지 노출 순서다. **항목이 하나라도 있는 그룹만 온다.**',
  })
  readonly groups!: AssessmentGroupDto[];
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

  @ApiPropertyOptional({
    type: AssessmentDto,
    description:
      '심평원 병원평가. **HIRA 연동(ykiho)이 있고 평가대상인 병원만 온다** — 없으면 필드 자체가 없다.',
  })
  readonly assessment?: AssessmentDto;
}
