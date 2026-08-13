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
  @ApiProperty({ description: '사용한 양', example: 21400 })
  readonly used!: number;

  @ApiProperty({ description: '한도', example: 2000000 })
  readonly limit!: number;
}

/** 앱 몫. 하루·한 달 두 통이 겹쳐 걸린다. */
export class AppQuotaDto implements AiSearchAppQuota {
  @ApiPropertyOptional({
    type: QuotaWindowDto,
    description: '일 단위 사용량. KST 자정에 리셋된다.',
  })
  readonly daily?: QuotaWindowDto;

  @ApiPropertyOptional({
    type: QuotaWindowDto,
    description:
      '월 단위 사용량. 매월 1일에 리셋된다. ' +
      '`daily` 와 함께 걸리며, 먼저 소진되는 쪽이 적용된다.',
  })
  readonly monthly?: QuotaWindowDto;
}

/** 개인 몫. 하루·월로 나누지 않고 잔여량 하나로 관리한다. */
export class UserQuotaDto implements AiSearchUserQuota {
  @ApiPropertyOptional({
    type: QuotaWindowDto,
    description: '사용자 잔여량. 주기적으로 리셋되지 않는다.',
  })
  readonly balance?: QuotaWindowDto;
}

/**
 * 지금 쓰는 몫. **둘 다 내려준다 — 화면이 골라 쓴다.**
 *
 * 실제로 깎이는 것은 신원의 것 하나다(로그인했으면 개인 몫, 아니면 앱 몫).
 * 그래도 둘 다 싣는 것은, 안 깎는 쪽도 얼마나 남았는지는 알아야 해서다.
 *
 * **없는 쪽은 안 걸렸다는 뜻이다.** 지금은 로그인이 없어 `user` 가 늘 비어 있다.
 */
export class QuotaDto implements AiSearchQuota {
  @ApiPropertyOptional({
    type: AppQuotaDto,
    description: '앱 단위 사용량.',
  })
  readonly app?: AppQuotaDto;

  @ApiPropertyOptional({
    type: UserQuotaDto,
    description: '사용자 단위 사용량. 로그인 상태에서만 온다.',
  })
  readonly user?: UserQuotaDto;
}

/**
 * 고를 수 있는 모델 하나.
 *
 * 잠기지 않은 것이 **서버가 실제로 부르는 모델**이다 — 목록을 서버가 내려주므로
 * 화면 표시가 실제와 어긋날 수 없다. 잠긴 것은 곧 열릴 것을 미리 보여 주는 자리다.
 */
export class ModelChoiceDto implements LlmModelChoice {
  @ApiProperty({
    description: '모델 식별자.',
    example: 'claude-haiku-4-5',
  })
  readonly id!: string;

  @ApiProperty({
    description: '선택할 수 없는 모델. 목록에는 표시되지만 요청에는 실리지 않는다.',
  })
  readonly locked!: boolean;
}

/**
 * `GET /ai/capabilities` 응답.
 *
 * **감싸서 보낸다.** 몫은 못 셀 수 있는데 벗겨서 보내면 그 경우에 빈 몸통이 되어,
 * 받는 쪽이 "없다" 와 "응답이 깨졌다" 를 구분하지 못한다.
 * 질문 응답(`AiSearchResponseDto.quota`)과 같은 모양이라 화면도 한 갈래로 다룬다.
 */
export class CapabilitiesResponseDto {
  @ApiPropertyOptional({
    type: QuotaDto,
    description: '사용량. 한도가 걸려 있지 않으면 오지 않는다.',
  })
  readonly quota?: QuotaDto;

  @ApiProperty({
    type: [ModelChoiceDto],
    description: '선택할 수 있는 모델 목록.',
  })
  readonly models!: ModelChoiceDto[];

  constructor(quota: AiSearchQuota | undefined, models: LlmModelChoice[]) {
    this.quota = quota;
    this.models = models;
  }
}
