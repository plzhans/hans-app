import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 코드 항목. 우리 코드다 (원본 HIRA/NMC 코드가 아니다). */
export class MetaCodeDto {
  @ApiProperty({ type: String, example: 'IM' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '내과' })
  readonly name!: string;

  @ApiPropertyOptional({ type: String, description: '설명' })
  readonly description?: string;
}

/**
 * 진료 분야 그룹. 기본 검색의 칩이다.
 *
 * **원본에는 없는 우리 분류다.** 47개 진료과목은 행정·수가 체계라 환자가 읽는 언어가 아니다.
 * 클라이언트는 그룹을 고른 뒤 subjects 의 code 들을 **펼쳐서** 검색의 `subject` 에 넘긴다
 * (`?subject=DENT,ORTHO,PERIO`). 검색 API 는 그룹을 모른다.
 *
 * 환자가 직접 가지 않는 과(영상의학·병리·진단검사 등)는 어느 그룹에도 없다.
 * 개별 과목 목록(/healthcare/meta/subjects)에는 그대로 있다.
 */
export class MetaSubjectGroupDto {
  @ApiProperty({ type: String, example: 'dental' })
  readonly code!: string;

  @ApiProperty({ type: String, example: '치과' })
  readonly name!: string;

  @ApiProperty({ type: [MetaCodeDto] })
  readonly subjects!: MetaCodeDto[];
}

/**
 * 병원 규모 (1·2·3차).
 *
 * 병상 수로 따로 나누지 않는다 — 의료법이 이미 병상 수로 종별을 규정한다
 * (의원 30병상 미만 · 병원 30 이상 · 종합병원 100 이상 · 상급종합 복지부 지정).
 * 사람들은 "의원이냐 병원이냐" 보다 "동네 병원이냐 큰 병원이냐" 로 생각한다.
 *
 * 요양병원·정신병원은 이 체계 밖이다. 장기 입원 시설이라 축이 다르다.
 */
export class MetaHospitalTierDto {
  @ApiProperty({
    type: String,
    description: 'TIER1 | TIER2 | TIER3',
    example: 'TIER1',
  })
  readonly code!: string;

  @ApiProperty({ type: String, example: '의원급' })
  readonly name!: string;

  @ApiProperty({ type: String, example: '외래 중심. 병상 30개 미만' })
  readonly description!: string;

  @ApiProperty({ type: [MetaCodeDto] })
  readonly classes!: MetaCodeDto[];
}
