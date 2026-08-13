import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 비급여 진료비 응답.
 *
 * **원본(공공데이터포털) 봉투가 아니다.** 미러(/data-go-kr/hira/hospitals/:ykiho/npay)는
 * 원본 구조를 그대로 돌려주지만, 이쪽은 병원 상세와 같은 규칙을 따른다 — 봉투 없음,
 * 병원 정보 반복 없음, 원본의 버릇(0건이면 items 가 빈 문자열, 1건이면 item 이 객체,
 * npayCd 가 number|string) 노출 없음.
 */

export class NonPaymentPriceDetailDto {
  @ApiPropertyOptional({
    type: String,
    example: 'Hip MRI',
    description:
      '요양기관이 자체적으로 붙인 항목명. **기관마다 표기가 달라 기관 간 비교에는 쓰지 않는다** — 비교는 code 로 한다.',
  })
  readonly name?: string;

  @ApiProperty({
    type: Number,
    example: 450000,
    description: '그 기관이 실제로 받는 금액(원).',
  })
  readonly amount!: number;
}

export class NonPaymentPriceDto {
  @ApiProperty({
    type: Number,
    example: 450000,
    description: '최저가(원). **단일가면 max 와 같다** — 두 값이 같으면 범위로 표시하지 않는다.',
  })
  readonly min!: number;

  @ApiProperty({ type: Number, example: 600000, description: '최고가(원).' })
  readonly max!: number;

  @ApiProperty({
    type: NonPaymentPriceDetailDto,
    isArray: true,
    description:
      '범위를 이룬 개별 행. **한 코드에 여러 행일 수 있다** — 예: 체외충격파(SZ0840000)의 단순·복잡.\n\n' +
      '**빈 배열도 정상이다.** 원본이 범위만 제공하는 출처에서는 세부 내역이 없다 — 조회 실패를 뜻하지 않으며, 이 경우 범위(min·max)만 표시한다.',
  })
  readonly details!: NonPaymentPriceDetailDto[];
}

export class NonPaymentItemDto {
  @ApiProperty({
    type: String,
    example: '480510000',
    description:
      '표준 항목코드. 기관 간 비교는 이 코드로 한다. 코드가 없는 원본 행은 `sno:12` 형태로 혼자 선다.',
  })
  readonly code!: string;

  @ApiProperty({
    type: String,
    example: '근골격계 · 고관절',
    description: '항목명. 대분류는 category 에 있으므로 뒷부분만 담는다.',
  })
  readonly name!: string;

  @ApiProperty({ type: NonPaymentPriceDto })
  readonly price!: NonPaymentPriceDto;
}

export class NonPaymentCategoryDto {
  @ApiProperty({ type: String, example: 'MRI진단료', description: '중분류명' })
  readonly name!: string;

  @ApiPropertyOptional({
    type: String,
    example: '1032A',
    description:
      '중분류코드(원본 npayMdivCd). 화면이 이 코드로 표시 그룹(검사·초음파·MRI…)을 묶는다. 코드마스터에 없는 항목이면 없다.',
  })
  readonly mdivCd?: string;

  @ApiProperty({ type: NonPaymentItemDto, isArray: true })
  readonly items!: NonPaymentItemDto[];
}

export class HospitalNonPaymentDto {
  @ApiPropertyOptional({
    type: String,
    description:
      '병원이 신고한 비급여 안내 URL. 원본은 행마다 같은 값을 반복하지만 여기서는 한 번만 싣는다. 없는 기관이 있고, 의원급(크롤 출처)엔 아예 없다.',
  })
  readonly noticeUrl?: string;

  @ApiProperty({
    enum: ['hira', 'web', 'none', 'requestable', 'unavailable'],
    description:
      '이 응답의 출처, 또는 왜 비었는지.\n\n' +
      '- `hira` — 공개 API(병원급 이상). 금액이 행마다 단일값이라 `price.details` 가 찬다.\n' +
      '- `web` — 심평원 홈페이지(의원급). 원본이 범위만 줘서 **`price.details` 가 빈다**.\n' +
      '- `none` — 조회했으나 그 기관이 신고한 항목이 없다. 다시 요청해도 결과가 같다.\n' +
      '- `requestable` — 공개 API 에 없고 아직 조회한 적도 없다. **갱신 요청(POST .../hira-npay/request)이 가능하다.**\n' +
      '- `unavailable` — 요청할 수 없다. 심평원 식별자(ykiho)가 없는 병원은 조회 자체가 불가능하다.',
  })
  readonly source!: string;

  @ApiPropertyOptional({
    enum: ['pending', 'running', 'failed'],
    description:
      '갱신 요청의 진행 상태. `source=requestable` 일 때만 의미가 있으며, 요청한 적이 없으면 오지 않는다.\n\n' +
      '**`done` 상태는 없다** — 처리가 끝나면 결과가 `source`(web 또는 none)로 나타난다.',
  })
  readonly requestStatus?: string;

  @ApiProperty({
    type: NonPaymentCategoryDto,
    isArray: true,
    description:
      '대분류 묶음. 원본 게시 순서를 유지한다. **빈 배열도 정상이다** — 사유는 `source` 로 확인한다.',
  })
  readonly categories!: NonPaymentCategoryDto[];
}

export class NonPaymentRequestResultDto {
  @ApiProperty({
    type: String,
    example: 'queued',
    description:
      '`queued` — 요청이 등록됐다. 처리가 끝나면 다음 조회부터 `source` 가 web 또는 none 으로 바뀐다.',
  })
  readonly result!: string;
}
