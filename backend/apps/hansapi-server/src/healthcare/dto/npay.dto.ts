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
      '요양기관이 자체적으로 붙인 항목명. **표기가 기관 제각각이라 이 값으로 기관 간 비교하지 마라** — 비교는 code 로 한다.',
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
    description:
      '최저가(원). **단일가면 max 와 같다** — 같은 값이면 범위로 표시하지 마라.',
  })
  readonly min!: number;

  @ApiProperty({ type: Number, example: 600000, description: '최고가(원).' })
  readonly max!: number;

  @ApiProperty({
    type: NonPaymentPriceDetailDto,
    isArray: true,
    description:
      '범위를 이룬 개별 행. **한 코드에 여러 행이 정상이다** — 체외충격파(SZ0840000)가 단순/복잡 두 행인 식이다.\n\n' +
      '**빈 배열이 정상이다** — 원본이 처음부터 범위만 주는 출처가 그렇다. 비었으면 "쪼갤 내역이 없다" 는 뜻이지 "못 받았다" 가 아니다. 그때는 범위만 보여주면 된다.',
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
      '- `none` — 받아봤는데 그 기관이 신고한 게 없다. **끝이다** — 다시 요청해도 같다.\n' +
      '- `requestable` — 공개 API 에 없고 아직 받아본 적도 없다. **갱신 요청(POST .../hira-npay/request)이 가능하다.**\n' +
      '- `unavailable` — 요청할 수 없다. HIRA 연동(ykiho)이 없는 병원은 조회 자체가 불가능하다.',
  })
  readonly source!: string;

  @ApiPropertyOptional({
    enum: ['pending', 'running', 'failed'],
    description:
      '갱신 요청의 진행 상태. `source=requestable` 일 때만 의미가 있다. 요청한 적 없으면 없다.\n\n' +
      '**`done` 은 오지 않는다** — 처리가 끝났으면 그 결과가 `source`(web|none)로 나타난다.',
  })
  readonly requestStatus?: string;

  @ApiProperty({
    type: NonPaymentCategoryDto,
    isArray: true,
    description:
      '대분류 묶음. 원본 게시 순서를 유지한다. **빈 배열이 정상이다** — 왜 비었는지는 `source` 를 봐라.',
  })
  readonly categories!: NonPaymentCategoryDto[];
}

export class NonPaymentRequestResultDto {
  @ApiProperty({
    type: String,
    example: 'queued',
    description:
      '`queued` — 큐에 등록됐다. 배치가 처리하면 다음 조회부터 `source` 가 web|none 으로 바뀐다.',
  })
  readonly result!: string;
}
