import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Inject, Injectable } from '@nestjs/common';
import {
  APICallError,
  Output,
  generateText,
  jsonSchema,
  type GenerateTextResult,
} from 'ai';

import {
  LLM_CONFIG,
  type LlmConfig,
  type LlmEndpointConfig,
  type LlmProviderName,
} from './llm.config';
import {
  LlmError,
  type LlmCall,
  type LlmJsonSchema,
  type LlmPrepareInput,
  type LlmProviderOptions,
} from './llm.types';

/**
 * JSON Schema → SDK 출력 사양. **호출부가 `ai` 를 직접 import 하지 않게 하려고 둔다** —
 * 스키마를 파일에서 읽어 그대로 넘기는 게 전부인데, 그것 때문에 도메인이 SDK 를 물면
 * 이 패키지를 만든 의미가 없다.
 */
export function jsonOutput(spec: LlmJsonSchema): Output.Output {
  return Output.object({ name: spec.name, schema: jsonSchema(spec.schema) });
}

/** 오류 본문을 예외에 실을 때 자르는 길이. 전문을 남기면 로그가 프롬프트로 덮인다. */
const MAX_ERROR_BODY = 500;

/**
 * LLM 호출 대행자. **두 단계로 나뉜다.**
 *
 * ```
 *   prepare()  설정 + 업체 사정  →  호출 뼈대(LlmCall)
 *      ↓        호출부가 messages·output 을 채운다
 *   chat()     받은 그대로 발송 + 예외 변환 + 미지정 기본값
 * ```
 *
 * 나눈 이유는 **업체 사정과 대화 내용이 서로 다른 곳에 있기 때문**이다.
 * 어느 클라이언트를 쓸지·캐시를 어디 걸지는 설정을 아는 이 계층이 알고,
 * 무엇을 물을지는 도메인이 안다. 한 함수로 합치면 둘 중 하나가 반대편으로 새어 나간다.
 *
 * [프로바이더를 인터페이스로 안 나눈 이유]
 * **AI SDK 자체가 이미 프로바이더 추상화다.** 그 위에 우리 인터페이스를 또 얹으면 같은 일을
 * 두 번 하게 된다 — 실제로 그렇게 짰다가 걷어냈다. 여기 남은 일은 "설정 → 모델 인스턴스"
 * 뿐이고 프로바이더당 10줄이라, switch 가 파일 세 개보다 읽기 쉽다.
 *
 * [한 방 호출이 구조로 보장된다]
 * `tools` 도 `stopWhen` 도 넘길 자리가 LlmCall 에 없다. generateText 는 기본이 단일 생성이라
 * 도구가 없으면 루프 자체가 성립하지 않는다 — 왕복은 항상 1회다.
 * 도구 루프가 필요해지면 그때 chat 옆에 다른 메서드를 만든다(이건 건드리지 않는다).
 */
@Injectable()
export class LlmService {
  constructor(@Inject(LLM_CONFIG) private readonly config: LlmConfig) {}

  /**
   * 호출 뼈대를 만든다. **업체마다 다른 것을 여기서 다 흡수한다** — 어느 SDK 클라이언트를
   * 쓸지, 어떤 설정이 필수인지, 업체 고유 옵션이 무엇인지.
   *
   * 돌려준 객체의 `messages` 에는 **시스템 메시지 하나가 들어 있다.** 호출부는 뒤에
   * 사용자 turn 을 붙이고 `output` 을 채운 다음 chat 으로 넘기면 된다.
   *
   * **설정이 모자라면 여기서 던진다** — 부팅이 아니라 호출 시점이다(키가 없다고 서버가
   * 못 뜨면 안 된다). 모델 인스턴스를 매번 만드는 것은 상태 없는 팩토리라 비용이 없어서다.
   */
  prepare(input: LlmPrepareInput): LlmCall {
    const provider = input.provider ?? this.config.provider;
    const resolved = this.resolve(provider, input);

    return {
      provider,
      model: resolved.model,
      providerOptions: resolved.providerOptions,
      // **시스템 프롬프트가 최상위 system 이 아니라 messages[0] 인 이유**는 캐시다.
      // 최상위 system 은 문자열이라 providerOptions 를 붙일 자리가 없고, Anthropic 의
      // cache_control 은 메시지 파트에만 걸린다. chat 이 allowSystemInMessages 를 켠다.
      messages: [
        {
          role: 'system',
          content: input.system,
          ...(resolved.systemOptions
            ? { providerOptions: resolved.systemOptions }
            : {}),
        },
      ],
    };
  }

  /**
   * 준비된 호출을 **그대로 보낸다.** 메시지를 만지지 않는다 — 조립은 prepare 와 호출부가 끝냈다.
   *
   * 여기서 하는 일은 셋뿐이다:
   *   · 상한값이 **비어 있을 때만** 설정값으로 채운다(호출부가 정했으면 그 값이 이긴다)
   *   · SDK 예외를 LlmError 로 옮긴다
   *   · 반환은 SDK 결과 그대로. 우리 모양으로 옮겨 담지 않는다
   */
  async chat(
    call: LlmCall,
    // 제네릭 셋: 도구 없음(Record<string, never>) · 런타임 컨텍스트 없음 · 출력 사양.
    // 도구 자리가 비어 있는 것이 "루프가 안 돈다" 는 타입 수준의 증거다.
  ): Promise<GenerateTextResult<Record<string, never>, never, Output.Output>> {
    try {
      return await generateText({
        model: call.model,
        // prepare 가 system 을 messages[0] 에 넣었다. 이 플래그가 없으면 SDK 가 거절한다.
        allowSystemInMessages: true,
        messages: call.messages,
        ...(call.output ? { output: call.output } : {}),
        providerOptions: call.providerOptions,
        maxOutputTokens: call.maxOutputTokens ?? this.config.maxTokens,
        // SDK 는 4xx 를 재시도하지 않는다(429·5xx 만). 기본 2회면 충분하다.
        maxRetries: call.maxRetries ?? 2,
        timeout: call.timeout ?? this.config.timeoutSec * 1000,
      });
    } catch (cause) {
      throw toLlmError(cause, call.provider);
    }
  }

  /** 업체별로 갈리는 것만 고른다. prepare 가 이걸 LlmCall 로 조립한다. */
  private resolve(provider: LlmProviderName, input: LlmPrepareInput) {
    switch (provider) {
      case 'claude': {
        const endpoint = this.config.claude;
        const apiKey = required(endpoint.apiKey, 'llm.claude.apiKey', provider);
        const model = required(
          input.model ?? endpoint.model,
          'llm.claude.model',
          provider,
        );
        return {
          model: createAnthropic({ apiKey, baseURL: v1(endpoint) })(model),
          // **사고를 끄지 않고 effort 를 낮춘다.** Claude Opus 5 에서 thinking:disabled 는
          // 도구 호출이 평문으로 새거나 <thinking> 태그가 응답에 섞이는 알려진 실패 모드가
          // 있다. effort:low 로도 비용·지연 절감은 충분하다.
          providerOptions: {
            anthropic: { effort: this.config.effort },
          } as LlmProviderOptions,
          // 안 붙어도 에러가 없다. 요금만 10배 나온다(usage 의 cacheReadTokens 로 확인할 것).
          systemOptions: input.cacheSystem
            ? ({
                anthropic: { cacheControl: { type: 'ephemeral' } },
              } as LlmProviderOptions)
            : undefined,
        };
      }

      case 'openai': {
        const endpoint = this.config.openai;
        const apiKey = required(endpoint.apiKey, 'llm.openai.apiKey', provider);
        const model = required(
          input.model ?? endpoint.model,
          'llm.openai.model',
          provider,
        );
        // 업체 고유 옵션이 없다 — **프롬프트 캐시는 OpenAI 가 자동이다.** 쓰기에 추가 요금이
        // 없어서 옵트인으로 둘 이유가 없기 때문이다(Anthropic 은 1.25배라 우리가 정한다).
        return {
          model: createOpenAI({ apiKey, baseURL: v1(endpoint) })(model),
          providerOptions: undefined,
          systemOptions: undefined,
        };
      }

      case 'local': {
        const endpoint = this.config.local;
        const model = required(
          input.model ?? endpoint.model,
          'llm.local.model',
          provider,
        );
        // **본가 클라이언트(createOpenAI)를 쓰면 안 된다.** 그쪽은 OpenAI 만 아는 파라미터를
        // 보내는데 로컬 런타임이 그걸 거절한다. openai-compatible 은 규격 최소집합만 가정한다.
        return {
          model: createOpenAICompatible({
            name: provider,
            // 로컬 엔드포인트는 대개 인증이 없다. 없으면 아예 넘기지 않는다.
            ...(endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}),
            baseURL: v1(endpoint),
            // **명시하지 않으면 구조화 출력이 꺼진 채로 돈다**(SDK 기본값). 켜도 실제 지원
            // 여부는 모델마다 달라서, 안 되는 모델이면 스키마가 무시된 자유 텍스트가 온다 —
            // 그건 chat 의 스키마 검증에서 LlmError 로 드러난다.
            supportsStructuredOutputs: true,
          })(model),
          providerOptions: undefined,
          systemOptions: undefined,
        };
      }
    }
  }
}

/** 설정의 baseUrl 은 호스트까지다(llm.config 주석 참고). 버전 경로는 여기서 붙인다. */
function v1(endpoint: LlmEndpointConfig): string {
  return `${endpoint.baseUrl.replace(/\/+$/, '')}/v1`;
}

/** 없으면 어느 설정 키가 비었는지 밝히고 던진다. */
function required(
  value: string | undefined,
  key: string,
  provider: LlmProviderName,
): string {
  if (!value) {
    throw new LlmError(`${key} is not configured`, provider);
  }
  return value;
}

/**
 * AI SDK 예외를 LlmError 로 옮긴다. **status 를 살려 두는 게 목적이다** —
 * 상위(컨트롤러)가 429 만 그대로 흘리고 나머지는 5xx 로 바꾸기 때문이다.
 *
 * 스키마 검증 실패·JSON 파싱 실패도 여기로 온다(NoObjectGeneratedError 계열).
 * 그건 status 가 없어 타임아웃과 같은 자리에 떨어지는데, 어차피 둘 다 우리 잘못이 아니고
 * 사용자에게는 "잠시 뒤 다시" 가 맞는 답이라 구분하지 않는다.
 */
function toLlmError(cause: unknown, provider: LlmProviderName): LlmError {
  if (cause instanceof LlmError) {
    return cause;
  }
  if (APICallError.isInstance(cause)) {
    return new LlmError(
      `${provider} returned ${cause.statusCode ?? 'an error'}`,
      provider,
      cause.statusCode,
      cause.responseBody?.slice(0, MAX_ERROR_BODY),
    );
  }
  return new LlmError(
    `${provider} request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    provider,
  );
}
