import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 지하철역.
 *
 * **언어를 골라 주지 않고 다 담는다.** 다른 API 와 다른 점이다 — 클라이언트가 통째로 받아
 * 맵으로 들고 화면의 역명을 찾아 바꾸는 데 쓴다. 언어를 바꿀 때 다시 받지 않아도 된다.
 *
 * **code 도 없다.** 원본의 역코드는 노선마다 달라서(환승역은 같은 역에 코드가 여러 개다)
 * 역을 식별하지 못한다. 병원 상세의 교통정보도 역을 코드가 아니라 한국어 이름으로 가리킨다.
 * 그래서 **이름(`ko`)이 곧 키다.**
 */
export class SubwayStationDto {
  @ApiProperty({
    type: String,
    example: '총신대입구',
    description:
      '한국어 역명. **이게 키다.**\n\n' +
      "병원 상세의 `transport.subway[].arrival`(예: '총신대입구역 3번 출구')에서 역명을 뽑아 " +
      "이 값과 맞춘다. '역' 접미사와 부역명 괄호는 이미 떼어져 있다.",
  })
  readonly ko!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Chongshin Univ.(Isu)',
    description:
      '영문 역명. 원본이 전 역에 주므로 사실상 항상 있다.\n\n' +
      '**없으면 `ko` 를 대신 보여줘라.** 지어내면 안 된다.',
  })
  readonly en?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'チョンシンデイック',
    description:
      '일문 역명. **대구·대전·인천공항 역들은 비어 있다** — 원본이 주지 않는다.\n\n' +
      '**없으면 `ko` 를 대신 보여줘라.** 빈칸을 그대로 두면 화면이 빈다.',
  })
  readonly ja?: string;

  @ApiProperty({
    type: [String],
    example: ['4호선'],
    description: '이 역을 지나는 노선. 환승역이면 여러 개다.',
  })
  readonly lines!: string[];
}

/**
 * 지하철역 목록 응답.
 *
 * `items` 키는 다른 목록 API(ListResponseDto)와 같게 맞췄고, **`version` 이 더 붙는다.**
 *
 * 원본의 상세(제공기관·데이터셋명·파일명)는 넣지 않는다 — 그건 우리 내부 사정이고, 클라이언트가
 * 알아야 할 건 "지금 들고 있는 게 언제 자료냐" 하나다. 그 값은 `ETag` 로도 나가지만, 헤더는
 * 브라우저 fetch 에서 꺼내 쓰기 번거로워(CORS expose 설정이 필요하다) 본문에도 같이 둔다.
 */
export class SubwayStationListDto {
  @ApiProperty({
    type: String,
    example: '20260701',
    description:
      '원본 데이터셋의 배포일자 (`YYYYMMDD`).\n\n' +
      '**이 값이 그대로면 역 목록도 그대로다.** 저장해 둔 버전과 같으면 다시 파싱할 필요가 없다.\n\n' +
      '원본 갱신 주기가 길어(연 1~2회) 자주 바뀌지 않는다.',
  })
  readonly version!: string;

  @ApiProperty({ type: [SubwayStationDto], description: '역 목록' })
  readonly items!: SubwayStationDto[];

  constructor(version: string, items: SubwayStationDto[]) {
    this.version = version;
    this.items = items;
  }
}
