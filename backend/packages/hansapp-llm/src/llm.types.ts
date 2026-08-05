import type { JSONValue, LanguageModel, ModelMessage, Output } from 'ai';

import type { LlmProviderName } from './llm.config';

/**
 * 업체 고유 옵션. AI SDK 의 `providerOptions` 와 같은 모양인데, 그 타입(ProviderOptions)이
 * 패키지 밖으로 안 나와서 여기서 다시 적는다 — 바깥 프로바이더 이름을 키로, 그 업체의
 * 옵션 객체를 값으로 갖는다. 예: `{ anthropic: { effort: 'low' } }`
 */
export type LlmProviderOptions = Record<string, { [key: string]: JSONValue }>;

/**
 * 구조화 출력 스키마. 이걸 주면 응답이 **스키마를 따르는 JSON** 으로 강제된다.
 *
 * 업체마다 부르는 이름이 다르지만(Claude `output_config.format`,
 * OpenAI `response_format.json_schema`) 넘기는 것은 같은 JSON Schema 라서 하나로 받는다.
 * `jsonOutput()` 이 이걸 SDK 의 출력 사양으로 바꾼다.
 */
export interface LlmJsonSchema {
  /** 스키마 이름. OpenAI 가 요구한다(Claude 는 무시). */
  readonly name: string;
  /** JSON Schema 본문. `additionalProperties: false` 와 `required` 가 있어야 한다. */
  readonly schema: Record<string, unknown>;
}

/**
 * `prepare()` 가 무엇을 준비할지 정하는 값. **업체를 고르는 데 필요한 것만** 담는다 —
 * 실제 대화 내용은 여기 없다(그건 호출부가 params 에 직접 채운다).
 */
export interface LlmPrepareInput {
  /** 시스템 프롬프트. prepare 가 messages[0] 으로 넣어 준다. */
  readonly system: string;
  /** 없으면 설정의 기본값(llm.provider). */
  readonly provider?: LlmProviderName;
  /** 없으면 프로바이더별 설정의 기본 모델. */
  readonly model?: string;
  /**
   * 시스템 프롬프트를 캐시한다(Anthropic 만 해당). **켤지는 호출부가 정한다** —
   * 캐시 쓰기가 정가의 1.25배라, 프롬프트가 재사용되지 않으면 오히려 손해다.
   * 매 요청 같은 프롬프트를 쓰는 곳만 켠다. 다른 업체는 자동이라 이 값을 무시한다.
   */
  readonly cacheSystem?: boolean;
}

/**
 * `generateText` 에 그대로 넘어갈 호출 한 벌. **prepare 가 만들고 호출부가 마저 채운다.**
 *
 * 필드 이름이 SDK 와 같은 것은 의도다 — chat 이 이걸 그대로 펼쳐 넘기므로,
 * 우리 이름으로 바꿨다가 다시 옮기는 매핑이 없다.
 *
 * prepare 가 채우는 것: `provider` `model` `messages[0]`(시스템) `providerOptions`
 * 호출부가 채우는 것:  `messages` 뒤쪽(사용자 turn) `output` 그리고 필요하면 상한값들
 */
export interface LlmCall {
  /**
   * 어느 업체로 갔는지. **generateText 에는 안 넘어간다** — chat 이 오류에 태그하고,
   * 호출부가 응답에 실을 때 쓴다(요청이 생략했으면 설정 기본값이 채워져 있다).
   */
  readonly provider: LlmProviderName;
  readonly model: LanguageModel;
  /** prepare 가 시스템 메시지 하나를 넣어 둔다. 호출부가 사용자 turn 을 뒤에 붙인다. */
  messages: ModelMessage[];
  /** 구조화 출력 사양. 없으면 자유 텍스트. */
  output?: Output.Output;
  /** 업체 고유 최상위 옵션(Anthropic 의 effort 등). prepare 가 채운다. */
  providerOptions?: LlmProviderOptions;
  /** 아래 셋은 **비워 두면 chat 이 설정값으로 채운다.** 값이 있으면 그대로 쓴다. */
  maxOutputTokens?: number;
  maxRetries?: number;
  /** 밀리초. */
  timeout?: number;
}

/*
 * 응답 타입은 여기 없다. **AI SDK 의 GenerateTextResult 를 그대로 돌려준다** —
 * 예전엔 LlmChatResponse·LlmUsage 로 한 번 더 옮겨 담았는데, SDK 타입을 한 겹 베낀 것
 * 이상이 아니어서 걷어냈다(usage 매핑만 12줄이었다).
 */

/**
 * LLM 호출 실패. 어느 프로바이더에서 어떤 상태로 실패했는지 남긴다.
 * 상위(컨트롤러)가 상태코드를 정할 수 있게 status 를 그대로 들고 있는다.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: LlmProviderName,
    /** HTTP 상태. 네트워크 실패·타임아웃이면 undefined. */
    readonly status?: number,
    /** 업체가 준 본문(잘라서). 원인 파악용. */
    readonly body?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
