import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Inject, Injectable } from '@nestjs/common';
import {
  APICallError,
  Output,
  RetryError,
  generateText,
  jsonSchema,
  type GenerateTextResult,
} from 'ai';

import {
  LLM_SETTINGS_SOURCE,
  type LlmEndpointSettings,
  type LlmSettingsSource,
} from './llm-settings.source';
import type { LlmProviderName } from './llm.config';
import {
  LlmConfigError,
  LlmModelNotAllowedError,
  LlmError,
  LlmInvalidCallError,
  type LlmCall,
  type LlmModelChoice,
  type LlmJsonSchema,
  type LlmPrepareInput,
  type LlmProviderOptions,
} from './llm.types';

/** JSON Schema → SDK 출력 사양. 호출부가 `ai` 를 직접 import 하지 않게 하려고 둔다. */
export function jsonOutput(spec: LlmJsonSchema): Output.Output {
  return Output.object({ name: spec.name, schema: jsonSchema(spec.schema) });
}

/** 오류 본문을 예외에 실을 때 자르는 길이. */
const MAX_ERROR_BODY = 500;

/**
 * LLM 호출 대행자. 두 단계로 나뉜다.
 *
 * ```
 *   prepare()  설정 + 업체 사정  →  호출 뼈대(LlmCall)
 *      ↓        호출부가 messages·output 을 채운다
 *   chat()     받은 그대로 발송 + 예외 변환 + 미지정 기본값
 * ```
 *
 * 나눈 이유는 **업체 사정과 대화 내용이 서로 다른 곳에 있기 때문**이다. 어느 클라이언트를
 * 쓸지·캐시를 어디 걸지는 설정을 아는 이 계층이 알고, 무엇을 물을지는 도메인이 안다.
 *
 * 프로바이더를 인터페이스로 나누지 않는다 — AI SDK 자체가 이미 프로바이더 추상화라
 * 그 위에 한 겹 더 얹으면 같은 일을 두 번 한다.
 *
 * **왕복은 항상 1회다.** `tools` 도 `stopWhen` 도 LlmCall 에 넘길 자리가 없어서 루프가
 * 구조적으로 성립하지 않는다. 도구 루프가 필요해지면 별도 메서드를 만든다.
 */
@Injectable()
export class LlmService {
  constructor(
    /*
      **설정을 부를 때마다 읽는다.** 부팅 때 한 번 받아 들고 있으면 화면에서 모델·한도를
      바꿔도 재시작 전까지 안 먹는다. 어디서 오는지(파일이든 DB든)는 이 패키지가 모른다.
    */
    @Inject(LLM_SETTINGS_SOURCE)
    private readonly settings: LlmSettingsSource,
  ) {}

  /**
   * 호출 뼈대를 만든다. 업체마다 다른 것(클라이언트·필수 설정·고유 옵션)을 여기서 흡수한다.
   * 돌려준 `messages` 에는 시스템 메시지 하나가 들어 있으니, 호출부는 사용자 turn 을 붙이고
   * `output` 을 채워 chat 으로 넘기면 된다.
   *
   * 설정이 모자라면 여기서 던진다 — 부팅이 아니라 호출 시점이다(키가 없다고 서버가
   * 못 뜨면 안 된다).
   */
  /**
   * 화면에 보여 줄 모델 목록. **고를 수 있는 것은 서버가 실제로 부르는 하나뿐이다.**
   *
   * 목록을 화면이 들고 있으면 설정이 바뀌는 순간 조용히 거짓말이 된다 — "Haiku 로
   * 보냅니다" 라고 적혀 있는데 서버는 다른 것을 부르는 식이다. 여기서 내려보내면
   * 그 어긋남이 구조적으로 불가능해진다.
   *
   * **허용 목록이 곧 화면의 목록이다.** 그중 기본 모델만 열려 있고 나머지는 자물쇠다 —
   * "곧 열린다" 를 미리 보여 주되, 골라도 요청에 실리지 않는다(유료가 열릴 때 푼다).
   */
  async listModels(): Promise<LlmModelChoice[]> {
    const endpoint = (await this.settings.load()).endpoint;
    // 등록된 키가 없으면 고를 것도 없다.
    if (!endpoint) return [];
    return allowedOf(endpoint).map((id) => ({
      id,
      locked: id !== endpoint.defaultModel,
    }));
  }

  async prepare(input: LlmPrepareInput): Promise<LlmCall> {
    const endpoint = (await this.settings.load()).endpoint;
    if (!endpoint) {
      throw new LlmConfigError(
        'No LLM endpoint is registered (관리자 → 설정 → AI 접속처)',
        'anthropic',
      );
    }
    /*
      **업체를 인자로 덮지 않는다.** 접속처가 목록이 되면서 "업체 이름" 만으로는 어느 행인지
      정해지지 않는다 — 같은 업체가 여럿일 수 있다. 어느 것으로 부를지는 목록에서 정한다.
    */
    const provider = endpoint.provider;
    /*
      **허용 목록 밖의 모델은 여기서 막는다.** 업체가 새 모델을 내도 관리 화면에서 허용하기
      전까지는 못 부른다 — 모델이 곧 단가라 "부를 수 있는 것" 을 명시해 두는 쪽이 맞다.
    */
    if (input.model && !allowedOf(endpoint).includes(input.model)) {
      throw new LlmModelNotAllowedError(input.model, provider);
    }
    const resolved = this.resolve(endpoint, input);

    return {
      provider,
      model: resolved.model,
      providerOptions: resolved.providerOptions,
      // 시스템 프롬프트를 최상위 system 이 아니라 messages[0] 에 두는 것은 캐시 때문이다.
      // 최상위 system 은 문자열이라 providerOptions 를 붙일 자리가 없다.
      //
      // **appendSystem 은 두 번째 시스템 메시지로 나간다.** 업체가 시스템을 블록 배열로
      // 받으므로 앞 블록에만 캐시가 걸리고, 뒤 블록은 요청마다 달라도 캐시를 안 깬다.
      messages: [
        {
          role: 'system',
          content: input.system,
          ...(resolved.systemOptions
            ? { providerOptions: resolved.systemOptions }
            : {}),
        },
        ...(input.appendSystem
          ? [{ role: 'system' as const, content: input.appendSystem }]
          : []),
      ],
    };
  }

  /**
   * 준비된 호출을 그대로 보낸다. 메시지는 만지지 않는다 — 조립은 prepare 와 호출부가 끝냈다.
   * 여기서 하는 일은 사전 검사, 미지정 상한값 채우기, 예외 변환뿐이다.
   */
  async chat(
    call: LlmCall,
    // 제네릭의 도구 자리가 비어 있는 것이 "루프가 안 돈다" 는 타입 수준의 증거다.
  ): Promise<GenerateTextResult<Record<string, never>, never, Output.Output>> {
    assertCallable(call);
    const config = await this.settings.load();
    try {
      return await generateText({
        model: call.model,
        // 메시지를 보고 정한다 — 항상 켜 두면 진짜 실수까지 통과한다.
        allowSystemInMessages: call.messages.some((m) => m.role === 'system'),
        messages: call.messages,
        ...(call.output ? { output: call.output } : {}),
        providerOptions: call.providerOptions,
        maxOutputTokens: call.maxOutputTokens ?? config.maxTokens,
        // SDK 는 4xx 를 재시도하지 않는다(429·5xx 만).
        maxRetries: call.maxRetries ?? 2,
        timeout: call.timeout ?? config.timeoutSec * 1000,
      });
    } catch (cause) {
      throw toLlmError(cause, call.provider, modelIdOf(call));
    }
  }

  /** 업체별로 갈리는 것만 고른다. prepare 가 이걸 LlmCall 로 조립한다. */
  private resolve(endpoint: LlmEndpointSettings, input: LlmPrepareInput) {
    const provider = endpoint.provider;
    switch (provider) {
      case 'anthropic': {
        const model = required(
          input.model ?? endpoint.defaultModel,
          'endpoint.defaultModel',
          provider,
        );
        if (!endpoint.secret) {
          throw new LlmConfigError(
            'endpoint secret is not configured',
            provider,
          );
        }
        /*
          **키 유형이 헤더를 정한다.** SDK 는 apiKey 와 authToken 을 둘 다 주면 거절하므로
          하나만 골라야 하고, 값만 보고는 어느 쪽인지 확신할 수 없다(접두사에 기대면 업체가
          형식을 바꾸는 날 깨진다). 등록할 때 고른 유형을 그대로 따른다.
        */
        const credentials =
          endpoint.keyType === 'authToken'
            ? {
                authToken: endpoint.secret,
                // 이 베타 헤더가 없으면 OAuth 토큰을 /v1/messages 가 거절한다.
                headers: { 'anthropic-beta': 'oauth-2025-04-20' },
              }
            : { apiKey: endpoint.secret };
        return {
          model: createAnthropic({ ...credentials, baseURL: v1(endpoint) })(
            model,
          ),
          // 최상위 업체 옵션은 쓰지 않는다(effort 는 설정에서 걷어냈다 — llm.config 주석).
          providerOptions: undefined,
          // 안 붙어도 에러는 없다. 요금만 10배 나온다(usage.cacheReadTokens 로 확인).
          systemOptions: input.cacheSystem
            ? ({
                anthropic: { cacheControl: { type: 'ephemeral' } },
              } as LlmProviderOptions)
            : undefined,
        };
      }

      case 'openai': {
        const apiKey = required(endpoint.secret, 'endpoint secret', provider);
        const model = required(
          input.model ?? endpoint.defaultModel,
          'endpoint.defaultModel',
          provider,
        );
        // 고유 옵션이 없다 — 프롬프트 캐시가 자동이라 옵트인할 것이 없다.
        return {
          model: createOpenAI({ apiKey, baseURL: v1(endpoint) })(model),
          providerOptions: undefined,
          systemOptions: undefined,
        };
      }

      case 'local': {
        const model = required(
          input.model ?? endpoint.defaultModel,
          'endpoint.defaultModel',
          provider,
        );
        // 본가 클라이언트(createOpenAI)는 OpenAI 만 아는 파라미터를 보내서 로컬 런타임이
        // 거절한다. openai-compatible 은 규격 최소집합만 가정한다.
        return {
          model: createOpenAICompatible({
            name: provider,
            // 로컬 엔드포인트는 대개 인증이 없다.
            ...(endpoint.secret ? { apiKey: endpoint.secret } : {}),
            baseURL: v1(endpoint),
            // 명시하지 않으면 구조화 출력이 꺼진 채로 돈다(SDK 기본값).
            supportsStructuredOutputs: true,
          })(model),
          providerOptions: undefined,
          systemOptions: undefined,
        };
      }
    }
  }
}

/**
 * 보내기 전에 호출이 성립하는지 본다. 전부 부르는 쪽의 조립 누락이다.
 *
 * 여기서 막지 않으면 업체가 400 을 주는데, 그건 status 가 붙어 와서 로그만 보면 업체
 * 탓처럼 보인다. `output` 은 없어도 되므로(자유 텍스트) 검사하지 않는다.
 */
function assertCallable(call: LlmCall): void {
  const bad = (what: string): never => {
    throw new LlmInvalidCallError(
      `llm call is not ready: ${what}`,
      call.provider,
    );
  };

  if (!call.model) {
    bad('model is missing (prepare 를 거치지 않았다)');
  }
  if (!Array.isArray(call.messages) || call.messages.length === 0) {
    bad('messages is empty');
  }
  // prepare 는 시스템 메시지까지만 채운다 — 사용자 turn 누락이 가장 흔하다.
  if (!call.messages.some((m) => m.role === 'user')) {
    bad('no user message (prepare 결과에 사용자 turn 을 붙이지 않았다)');
  }
  for (const [i, m] of call.messages.entries()) {
    if (typeof m.content === 'string' && m.content.trim().length === 0) {
      bad(`messages[${i}] (${m.role}) has empty content`);
    }
  }
  // 0·음수는 무제한이 아니라 잘못된 값이다. undefined 면 chat 이 설정값을 채운다.
  if (call.maxOutputTokens !== undefined && call.maxOutputTokens <= 0) {
    bad(`maxOutputTokens must be positive (got ${call.maxOutputTokens})`);
  }
}

/** 실패 로그에 실을 모델 이름. 성공 응답과 달리 실패에는 modelId 가 없어서 필요하다. */
function modelIdOf(call: LlmCall): string | undefined {
  const model: unknown = call.model;
  if (typeof model === 'string') {
    return model;
  }
  if (model && typeof model === 'object' && 'modelId' in model) {
    const { modelId } = model as { modelId?: unknown };
    return typeof modelId === 'string' ? modelId : undefined;
  }
  return undefined;
}

/** 설정의 baseUrl 은 호스트까지다. 버전 경로는 여기서 붙인다. */
function v1(endpoint: LlmEndpointSettings): string {
  return `${endpoint.baseUrl.replace(/\/+$/, '')}/v1`;
}

/** 없으면 어느 설정 키가 비었는지 밝히고 던진다. */
function required(
  value: string | undefined,
  key: string,
  provider: LlmProviderName,
): string {
  if (!value) {
    throw new LlmConfigError(`${key} is not configured`, provider);
  }
  return value;
}

/**
 * AI SDK 예외를 LlmError 로 옮긴다. **status 를 살려 두는 게 목적이다** — 상위(컨트롤러)가
 * 429 만 그대로 흘리고 나머지는 5xx 로 바꾼다.
 *
 * 스키마 검증 실패도 여기로 온다(NoObjectGeneratedError 계열). status 가 없어 타임아웃과
 * 같은 자리에 떨어지지만, 사용자에게는 둘 다 "잠시 뒤 다시" 라 구분하지 않는다.
 */
function toLlmError(
  cause: unknown,
  provider: LlmProviderName,
  /** 전선에서 모델을 못 건졌을 때 쓸 값(우리가 넘긴 것). */
  fallbackModel: string | undefined,
): LlmError {
  if (cause instanceof LlmError) {
    return cause;
  }

  // 재시도를 다 쓰면 RetryError 로 감싸여 오는데, 그 껍데기에는 status 도 본문도 없다.
  // 벗기지 않으면 401 이든 400 이든 로그가 똑같이 생긴다.
  const actual = RetryError.isInstance(cause) ? cause.lastError : cause;

  if (APICallError.isInstance(actual)) {
    return new LlmError(
      `${provider} returned ${actual.statusCode ?? 'an error'}`,
      provider,
      // 전선에 나간 body 가 우선이다 — 별칭이 풀렸다면 그 어긋남까지 드러난다.
      modelInBody(actual.requestBodyValues) ?? fallbackModel,
      actual.statusCode,
      actual.responseBody?.slice(0, MAX_ERROR_BODY),
    );
  }
  // 발송 전이나 네트워크 단에서 깨진 경우. 전선 기록이 없다.
  return new LlmError(
    `${provider} request failed: ${actual instanceof Error ? actual.message : String(actual)}`,
    provider,
    fallbackModel,
  );
}

/** APICallError 가 들고 있는 요청 body 에서 model 만 꺼낸다. 모양을 신뢰하지 않는다. */
function modelInBody(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'model' in body) {
    const { model } = body as { model?: unknown };
    return typeof model === 'string' ? model : undefined;
  }
  return undefined;
}

/**
 * 이 키로 부를 수 있는 모델들.
 *
 * **허용 목록이 비어 있으면 기본 모델 하나다.** 등록 직후의 흔한 상태에서 "아무것도 못
 * 부른다" 가 되지 않게 한다 — 목록을 채우는 것은 나중에 해도 되는 일이다.
 * 기본 모델은 목록에 안 적혀 있어도 늘 포함된다(서버가 그것으로 부르기 때문이다).
 */
function allowedOf(endpoint: LlmEndpointSettings): string[] {
  const listed = endpoint.allowedModels.filter(Boolean);
  const fallback = endpoint.defaultModel;
  if (listed.length === 0) return fallback ? [fallback] : [];
  return fallback && !listed.includes(fallback)
    ? [fallback, ...listed]
    : listed;
}
