import { DynamicModule, Module } from '@nestjs/common';
import type { ConfigSource } from '@hansapp/common';

import { buildLlmConfig, LLM_CONFIG } from './llm.config';
import { LlmService } from './llm.service';
import { SvcPromptRepository } from './svc-prompt.repository';

/**
 * LLM 계층 DI 진입점.
 *
 * **도메인을 알지 못한다** — "무엇을 물을지" 는 부르는 쪽이 정하고 여기서는 "어디로 어떻게
 * 보낼지" 만 다룬다. 그래서 검색·요약·분류 어디에 붙여도 이 패키지는 그대로다.
 *
 * **설정이 비어도 부팅은 정상이다.** 키가 없다는 사실은 호출 시점에 LlmError 로 드러난다 —
 * AI 는 부가 기능이라 없다고 서버가 못 뜨면 안 된다.
 */
@Module({})
export class LlmModule {
  static forRoot(source: ConfigSource): DynamicModule {
    return {
      module: LlmModule,
      providers: [
        { provide: LLM_CONFIG, useValue: buildLlmConfig(source) },
        LlmService,
        SvcPromptRepository,
      ],
      exports: [LLM_CONFIG, LlmService, SvcPromptRepository],
    };
  }
}
