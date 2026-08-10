import type { JSONValue, LanguageModel, ModelMessage, Output } from 'ai';

import type { LlmProviderName } from './llm.config';

/**
 * 업체 고유 옵션. AI SDK 의 `providerOptions` 와 같은 모양인데, 그 타입이 패키지 밖으로
 * 안 나와서 여기서 다시 적는다. 예: `{ anthropic: { effort: 'low' } }`
 */
export type LlmProviderOptions = Record<string, { [key: string]: JSONValue }>;

/**
 * 화면에 보여 줄 모델 하나.
 *
 * `locked` 는 **아직 못 고른다**는 뜻이다(요금제가 안 열렸다). 목록에 남겨 두는 것은
 * 곧 열릴 것을 미리 알리기 위해서고, 골라도 요청에는 안 실린다.
 */
export interface LlmModelChoice {
  readonly id: string;
  readonly locked: boolean;
}

/**
 * 구조화 출력 스키마. 주면 응답이 스키마를 따르는 JSON 으로 강제된다.
 * 업체마다 부르는 이름이 달라도 넘기는 것은 같은 JSON Schema 라 하나로 받는다.
 */
export interface LlmJsonSchema {
  /** 스키마 이름. OpenAI 가 요구한다(Anthropic 은 무시). */
  readonly name: string;
  /** JSON Schema 본문. `additionalProperties: false` 와 `required` 가 있어야 한다. */
  readonly schema: Record<string, unknown>;
}

/**
 * `prepare()` 가 무엇을 준비할지 정하는 값. 업체를 고르는 데 필요한 것만 담는다 —
 * 대화 내용은 호출부가 LlmCall 에 직접 채운다.
 */
export interface LlmPrepareInput {
  /** 시스템 프롬프트. prepare 가 messages[0] 으로 넣어 준다. */
  readonly system: string;
  /**
   * 시스템 프롬프트 **뒤에 덧붙일 블록.** 캐시를 걸지 않는다.
   *
   * **요청마다 달라지는 지시를 여기 둔다.** system 은 캐시되는 앞부분이라 한 글자만 달라져도
   * 캐시가 통째로 갈리는데, 그러면 부류마다(예: 무료·유료) 8천 토큰짜리 프롬프트가 따로
   * 캐시돼 쓰기 값이 배로 든다. 공통을 앞에 두고 갈리는 것만 뒤에 붙이면 캐시는 하나다.
   *
   * 사용자 turn 이 아니라 **시스템 자리**인 이유는, 이건 지시이지 대화 내용이 아니어서다 —
   * 질문 옆에 두면 사용자가 흉내 내기 쉬워진다.
   */
  readonly appendSystem?: string;
  /** 없으면 설정의 기본값(llm.provider). */
  readonly provider?: LlmProviderName;
  /** 없으면 프로바이더별 설정의 defaultModel. */
  readonly model?: string;
  /**
   * 시스템 프롬프트를 캐시한다(Anthropic 만 해당). 캐시 쓰기가 정가의 1.25배라 재사용되지
   * 않으면 손해이므로, 매 요청 같은 프롬프트를 쓰는 곳만 켠다. 다른 업체는 자동이라 무시한다.
   */
  readonly cacheSystem?: boolean;
}

/**
 * `generateText` 에 그대로 넘어갈 호출 한 벌. prepare 가 만들고 호출부가 마저 채운다.
 * 필드 이름을 SDK 와 맞춘 것은 chat 이 그대로 펼쳐 넘기기 위해서다(매핑 없음).
 *
 *   prepare  → `provider` `model` `messages[0]`(시스템) `providerOptions`
 *   호출부   → `messages` 뒤쪽(사용자 turn) `output` 필요하면 상한값들
 */
export interface LlmCall {
  /** generateText 에는 안 넘어간다 — 오류 태깅과 응답 표기에 쓴다. */
  readonly provider: LlmProviderName;
  readonly model: LanguageModel;
  messages: ModelMessage[];
  /** 구조화 출력 사양. 없으면 자유 텍스트. */
  output?: Output.Output;
  providerOptions?: LlmProviderOptions;
  /** 아래 셋은 비워 두면 chat 이 설정값으로 채운다. */
  maxOutputTokens?: number;
  maxRetries?: number;
  /** 밀리초. */
  timeout?: number;
}

// 응답 타입은 없다 — AI SDK 의 GenerateTextResult 를 그대로 돌려준다.

/**
 * LLM 호출 실패. 상위(컨트롤러)가 상태코드를 정할 수 있게 status 를 그대로 들고 있는다.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: LlmProviderName,
    /**
     * 요청에 실어 보낸 모델(응답이 밝힌 모델이 아니다 — 실패엔 응답이 없다).
     * 같은 업체라도 모델마다 되는 것이 달라서 provider 만으로는 원인을 못 좁힌다.
     * 호출을 시도조차 못 했으면 비어 있다.
     */
    readonly requestModel?: string,
    /** HTTP 상태. 네트워크 실패·타임아웃이면 undefined. */
    readonly status?: number,
    /** 업체가 준 본문(잘라서). */
    readonly body?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * 설정이 모자라 호출을 시도조차 못 한 경우(키 없음, 모델 이름 없음).
 *
 * 따로 나눈 것은 **status 로는 타임아웃과 구분이 안 되기 때문**이다. 둘 다 status 가 없어서
 * 합쳐 두면 컨트롤러가 설정 오류를 "잠시 뒤 다시" 로 안내하게 된다. 상위는 재시도 불가로 다룬다.
 */
export class LlmConfigError extends LlmError {
  constructor(message: string, provider: LlmProviderName) {
    super(message, provider);
    this.name = 'LlmConfigError';
  }
}

/**
 * 호출 뼈대가 성립하지 않는 경우(모델 없음, 메시지 비었음).
 *
 * 설정 오류와 나눈 것은 **고칠 사람이 다르기 때문**이다. 이건 부르는 코드의 버그라
 * 설정을 고쳐도 안 고쳐진다. 상위는 재시도 불가로 다룬다.
 */
export class LlmInvalidCallError extends LlmError {
  constructor(message: string, provider: LlmProviderName) {
    super(message, provider);
    this.name = 'LlmInvalidCallError';
  }
}

/**
 * 요청한 모델이 그 키의 허용 목록 밖인 경우.
 *
 * **위 둘과 나눈 것은 고칠 사람이 또 다르기 때문**이다. 설정도 우리 코드도 멀쩡하고,
 * 부르는 쪽이 안 되는 이름을 보낸 것이다 — 상위는 400 으로 돌려준다. 503 으로 뭉치면
 * "서버가 고장났나" 로 읽혀 사람이 기다리게 된다.
 */
export class LlmModelNotAllowedError extends LlmError {
  constructor(
    readonly model: string,
    provider: LlmProviderName,
  ) {
    super(`model is not allowed for this key: ${model}`, provider);
    this.name = 'LlmModelNotAllowedError';
  }
}
