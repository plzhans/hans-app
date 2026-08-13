import { Injectable } from '@nestjs/common';
import { LlmService, type LlmModelChoice } from '@hansapp/llm';

/**
 * 누가 어떤 모델을 고를 수 있나.
 *
 * **설정과 자격을 나눈다.** 무엇이 있는지는 설정이 알고(LlmService), 누가 쓸 수 있는지는
 * 여기가 안다 — 같은 목록이 사람에 따라 다르게 잠긴다.
 *
 * **화면이 목록을 들고 있으면 안 된다.** 설정이 바뀌는 순간 조용히 거짓말이 되기 때문이다
 * ("Haiku 로 보냅니다" 라고 적혀 있는데 서버는 다른 것을 부르는 식). 서버가 내려보내면
 * 그 어긋남이 구조적으로 불가능해진다.
 */
@Injectable()
export class AiModelService {
  constructor(private readonly llm: LlmService) {}

  /**
   * 고를 수 있는 모델. `locked` 는 **아직 못 고른다**는 뜻이다.
   *
   * 로그인 전(클라이언트 키만)에는 **서버가 실제로 부르는 하나만** 열린다. 나머지는
   * "곧 열린다" 를 미리 알리는 자물쇠다 — 골라도 요청에 안 실리므로, 열어 두면 고른 것과
   * 도는 것이 어긋난다.
   *
   * `entitled` 는 지금 **로그인 여부로 대신 본다.** 진짜 기준은 요금제인데 결제가 아직
   * 없어서다 — 붙으면 여기만 고치면 된다(화면은 `locked` 만 본다).
   */
  async list(entitled: boolean): Promise<LlmModelChoice[]> {
    const models = await this.llm.listModels();
    return entitled ? models.map((model) => ({ ...model, locked: false })) : models;
  }
}
