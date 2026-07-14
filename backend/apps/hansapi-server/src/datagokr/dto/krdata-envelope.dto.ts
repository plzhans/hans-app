import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 공공데이터포털 응답 봉투의 Swagger 스키마.
 *
 * 지역·진료과목처럼 **원본 API 에 대응이 없는 데이터**도 같은 봉투로 내려준다.
 * /data-go-kr 아래 응답은 출처를 가리지 않고 형태가 같아야 하기 때문이다.
 * (원본이 있는 것은 @krdata/* 스펙의 스키마를 그대로 참조한다 — krdata-schemas.ts)
 *
 * 문서 렌더러(vitepress-openapi)는 `$ref` 일 때만 하위 표를 만든다. 그래서 봉투의 각 층을
 * 인라인 객체가 아니라 **이름 있는 클래스**로 쪼갠다. 안 그러면 그냥 `object` 로만 나온다.
 *
 * 봉투를 제네릭 팩토리로 찍어내면 Nest 의 swagger 플러그인이 함수 안의 클래스를 처리하지 못해
 * 부팅이 깨진다(`ReferenceError: string is not defined`). item 종류가 몇 개 안 되므로
 * 그냥 층마다 클래스를 적는다. 모든 @ApiProperty 에 type 을 명시해 플러그인 추론에 기대지 않는다.
 */
export class KrDataHeaderDto {
  @ApiProperty({
    type: String,
    description: '결과 코드. 정상은 00',
    example: '00',
  })
  readonly resultCode!: string;

  @ApiProperty({
    type: String,
    description: '결과 메시지',
    example: 'NORMAL SERVICE.',
  })
  readonly resultMsg!: string;
}

// ── NMC 지역 ────────────────────────────────────────────────

/** 원본 API 에 없다. NMC 는 지역을 코드로 주지 않아(주소 문자열뿐) 주소를 파싱해 집계했다. */
export class NmcRegionItemDto {
  @ApiProperty({ type: String, description: '시도명', example: '서울특별시' })
  readonly sidoNm!: string;

  @ApiPropertyOptional({
    type: String,
    description: '시군구명. 세종특별자치시처럼 시군구가 없는 지역은 값이 없다.',
    example: '강남구',
  })
  readonly sgguNm?: string;

  @ApiProperty({
    type: Number,
    description: '이 지역의 병원 수',
    example: 3045,
  })
  readonly hospitalCount!: number;
}

export class NmcRegionItemsDto {
  @ApiProperty({ type: [NmcRegionItemDto] })
  readonly item!: NmcRegionItemDto[];
}

export class NmcRegionBodyDto {
  @ApiProperty({ type: NmcRegionItemsDto })
  readonly items!: NmcRegionItemsDto;

  @ApiProperty({ type: Number, description: '한 페이지 결과 수', example: 100 })
  readonly numOfRows!: number;

  @ApiProperty({ type: Number, description: '페이지 번호', example: 1 })
  readonly pageNo!: number;

  @ApiProperty({ type: Number, description: '전체 결과 수', example: 263 })
  readonly totalCount!: number;
}

export class NmcRegionResultDto {
  @ApiProperty({ type: KrDataHeaderDto })
  readonly header!: KrDataHeaderDto;

  @ApiProperty({ type: NmcRegionBodyDto })
  readonly body!: NmcRegionBodyDto;
}

export class NmcRegionResponseDto {
  @ApiProperty({ type: NmcRegionResultDto })
  readonly response!: NmcRegionResultDto;
}

// ── HIRA 지역 ───────────────────────────────────────────────

/** 원본은 시도 코드 목록만 준다. **시군구 코드 목록 API 가 없어** 병원 데이터에서 집계했다. */
export class HiraRegionItemDto {
  @ApiProperty({ type: String, description: '시도코드', example: '110000' })
  readonly sidoCd!: string;

  @ApiPropertyOptional({ type: String, description: '시도명', example: '서울' })
  readonly sidoCdNm?: string;

  @ApiProperty({ type: String, description: '시군구코드', example: '110019' })
  readonly sgguCd!: string;

  @ApiPropertyOptional({
    type: String,
    description: '시군구명. 심평원 자체 표기다 (예: 수원팔달구, 광주북구).',
    example: '중랑구',
  })
  readonly sgguCdNm?: string;

  @ApiProperty({ type: Number, description: '이 지역의 병원 수', example: 582 })
  readonly hospitalCount!: number;
}

export class HiraRegionItemsDto {
  @ApiProperty({ type: [HiraRegionItemDto] })
  readonly item!: HiraRegionItemDto[];
}

export class HiraRegionBodyDto {
  @ApiProperty({ type: HiraRegionItemsDto })
  readonly items!: HiraRegionItemsDto;

  @ApiProperty({ type: Number, description: '한 페이지 결과 수', example: 100 })
  readonly numOfRows!: number;

  @ApiProperty({ type: Number, description: '페이지 번호', example: 1 })
  readonly pageNo!: number;

  @ApiProperty({ type: Number, description: '전체 결과 수', example: 259 })
  readonly totalCount!: number;
}

export class HiraRegionResultDto {
  @ApiProperty({ type: KrDataHeaderDto })
  readonly header!: KrDataHeaderDto;

  @ApiProperty({ type: HiraRegionBodyDto })
  readonly body!: HiraRegionBodyDto;
}

export class HiraRegionResponseDto {
  @ApiProperty({ type: HiraRegionResultDto })
  readonly response!: HiraRegionResultDto;
}

// ── NMC 진료과목 ────────────────────────────────────────────

/**
 * 원본에는 병원별 진료과목 API 가 없다. basic 이 쉼표로 이어 붙인 과목명 문자열(dgidIdName)로
 * 줄 뿐이다. 코드마스터(D000)의 코드로 정규화해 보관한다.
 */
export class NmcSubjectItemDto {
  @ApiProperty({
    type: String,
    description: '진료과목 코드 (코드마스터 D000)',
    example: 'D001',
  })
  readonly subjectCd!: string;

  @ApiPropertyOptional({
    type: String,
    description: '진료과목명',
    example: '내과',
  })
  readonly subjectNm?: string;
}

export class NmcSubjectItemsDto {
  @ApiProperty({ type: [NmcSubjectItemDto] })
  readonly item!: NmcSubjectItemDto[];
}

export class NmcSubjectBodyDto {
  @ApiProperty({ type: NmcSubjectItemsDto })
  readonly items!: NmcSubjectItemsDto;

  @ApiProperty({ type: Number, description: '한 페이지 결과 수', example: 25 })
  readonly numOfRows!: number;

  @ApiProperty({ type: Number, description: '페이지 번호', example: 1 })
  readonly pageNo!: number;

  @ApiProperty({ type: Number, description: '전체 결과 수', example: 25 })
  readonly totalCount!: number;
}

export class NmcSubjectResultDto {
  @ApiProperty({ type: KrDataHeaderDto })
  readonly header!: KrDataHeaderDto;

  @ApiProperty({ type: NmcSubjectBodyDto })
  readonly body!: NmcSubjectBodyDto;
}

export class NmcSubjectResponseDto {
  @ApiProperty({ type: NmcSubjectResultDto })
  readonly response!: NmcSubjectResultDto;
}
