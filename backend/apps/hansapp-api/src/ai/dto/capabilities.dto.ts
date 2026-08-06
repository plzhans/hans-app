import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  LlmModelChoice,
  AiSearchAppQuota,
  AiSearchQuota,
  AiSearchQuotaWindow,
  AiSearchUserQuota,
} from '@hansapp/application';

/*
  **`/healthcare` 아래가 아니다.** 재는 대상은 병원이 아니라 부른 사람이라, 같은 잔액을
  다른 기능이 쓰기 시작해도 이 모양은 그대로다.

  응용 계층 타입 이름이 아직 `AiSearchQuota` 인 것은 계수기의 scope 가 기능별로 갈려
  있어서다(`ai-search:app:7`). 나가는 계약은 기능을 안 타므로 여기서는 이름을 줄인다.
*/

/** 통 하나의 상태. **어느 통인지는 담긴 필드 이름이 말한다.** */
export class QuotaWindowDto implements AiSearchQuotaWindow {
  @ApiProperty({ description: '지금까지 쓴 통합 토큰', example: 21400 })
  readonly used!: number;

  @ApiProperty({ example: 2000000 })
  readonly limit!: number;
}

/** 앱 몫. **우리 예산이다** — 이 앱에 이번 달 얼마까지 쓸 것인가. */
export class AppQuotaDto implements AiSearchAppQuota {
  @ApiPropertyOptional({
    type: QuotaWindowDto,
    description:
      '오늘 몫(KST 자정 리셋). 월 예산이 첫날에 다 타지 않게 하는 둑이다.',
  })
  readonly daily?: QuotaWindowDto;

  @ApiPropertyOptional({
    type: QuotaWindowDto,
    description:
      '이번 달 몫(월초 리셋). **이쪽이 진짜 예산이다.** ' +
      '`daily` 와 둘 중 먼저 차는 쪽이 막는다.',
  })
  readonly monthly?: QuotaWindowDto;
}

/** 개인 몫. 충전해서 쓰는 잔액이라 **리셋되지 않고, 하루·월로 나누지도 않는다.** */
export class UserQuotaDto implements AiSearchUserQuota {
  @ApiPropertyOptional({
    type: QuotaWindowDto,
    description: '충전 잔액. 리셋되지 않는다.',
  })
  readonly balance?: QuotaWindowDto;
}

/**
 * 지금 쓰는 몫. **둘 다 내려준다 — 화면이 골라 쓴다.**
 *
 * 실제로 깎이는 것은 신원의 것 하나다(로그인했으면 개인 잔액, 아니면 앱 예산).
 * 그래도 둘 다 싣는 것은, 안 깎는 쪽도 얼마나 남았는지는 알아야 해서다.
 *
 * **없는 쪽은 안 걸렸다는 뜻이다.** 지금은 로그인이 없어 `user` 가 늘 비어 있다.
 */
export class QuotaDto implements AiSearchQuota {
  @ApiPropertyOptional({
    type: AppQuotaDto,
    description:
      '앱 예산. 늘 온다. **로그인한 사용자에게는 이 값이 안 깎인다** — ' +
      '그때는 개인 잔액에서 깎는다.',
  })
  readonly app?: AppQuotaDto;

  @ApiPropertyOptional({
    type: UserQuotaDto,
    description:
      '개인 충전 잔액. **로그인했을 때만 온다** — 지금은 로그인이 없어 늘 비어 있다.',
  })
  readonly user?: UserQuotaDto;
}

/**
 * 고를 수 있는 모델 하나.
 *
 * **`locked` 는 아직 못 고른다는 뜻이다**(요금제가 안 열렸다). 목록에 남겨 두는 것은
 * 곧 열릴 것을 미리 알리기 위해서고, 골라도 요청에는 안 실린다.
 *
 * 잠기지 않은 것은 **서버가 실제로 부르는 모델**이다 — 화면 표시가 실제와 어긋날 수 없다.
 */
export class ModelChoiceDto implements LlmModelChoice {
  @ApiProperty({
    description: '업체가 쓰는 모델 id. 화면에 보일 이름은 여기서 뽑는다.',
    example: 'claude-haiku-4-5',
  })
  readonly id!: string;

  @ApiProperty({ description: '아직 못 고른다(자물쇠 표시).' })
  readonly locked!: boolean;
}

/**
 * `GET /ai/capabilities` 응답.
 *
 * **감싸서 보낸다.** 몫은 못 셀 수 있는데(Redis 미설정·읽기 실패, 한도 없음) 벗겨서
 * 보내면 그 경우에 빈 몸통이 되어, 받는 쪽이 "없다" 와 "응답이 깨졌다" 를 구분 못 한다.
 * 질문 응답(`AiSearchResponseDto.quota`)과 같은 모양이라 화면도 한 갈래로 다룬다.
 */
export class CapabilitiesResponseDto {
  @ApiPropertyOptional({
    type: QuotaDto,
    description:
      '쓴 몫. **못 셌으면 없다** — 화면은 없으면 아무것도 안 그린다 ' +
      '(0/0 은 다 쓴 것처럼 보인다).',
  })
  readonly quota?: QuotaDto;

  @ApiProperty({
    type: [ModelChoiceDto],
    description:
      '고를 수 있는 모델. **잠기지 않은 것이 서버가 실제로 부르는 모델이다** — ' +
      '화면이 목록을 들고 있으면 설정이 바뀌는 순간 조용히 거짓말이 된다.',
  })
  readonly models!: ModelChoiceDto[];

  constructor(quota: AiSearchQuota | undefined, models: LlmModelChoice[]) {
    this.quota = quota;
    this.models = models;
  }
}
