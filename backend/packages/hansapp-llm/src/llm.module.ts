import { DynamicModule, Module } from '@nestjs/common';
import type { ConfigSource } from '@hansapp/common';

import { buildLlmConfig, LLM_CONFIG } from './llm.config';
import { SvcPromptRepository } from './svc-prompt.repository';

/**
 * LLM 계층 DI 진입점.
 *
 * **도메인을 알지 못한다** — "무엇을 물을지" 는 부르는 쪽이 정하고 여기서는 "어디로 어떻게
 * 보낼지" 만 다룬다. 그래서 검색·요약·분류 어디에 붙여도 이 패키지는 그대로다.
 *
 * **설정이 비어도 부팅은 정상이다.** 키가 없다는 사실은 호출 시점에 LlmError 로 드러난다 —
 * AI 는 부가 기능이라 없다고 서버가 못 뜨면 안 된다.
 *
 * **LlmService 는 여기서 안 만든다.** 그것이 요구하는 LLM_SETTINGS_SOURCE 는 값을 DB 에서
 * 읽는 구현이고, 그 저장소는 응용 계층마다 다르다 — 이 모듈 안에서는 해결할 수가 없다.
 * 쓰는 계층이 제 스코프에 LlmService 와 그 구현을 나란히 두면 된다(ApplicationModule 참고).
 */
@Module({})
export class LlmModule {
  static forRoot(source: ConfigSource): DynamicModule {
    return {
      module: LlmModule,
      providers: [
        { provide: LLM_CONFIG, useValue: buildLlmConfig(source) },
        SvcPromptRepository,
      ],
      exports: [LLM_CONFIG, SvcPromptRepository],
    };
  }
}
