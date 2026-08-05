import type { ConfigSource } from '@hansapp/common';

/** LLM 설정 주입 토큰 */
export const LLM_CONFIG = Symbol('LLM_CONFIG');

/**
 * 어느 업체의 API 를 부를지. **모델 이름으로 유추하지 않는다** — 로컬에 올린 모델이
 * `claude-3-...` 라는 이름을 달고 있을 수도 있고, 같은 모델을 다른 게이트웨이로 부를 수도 있다.
 * 어디로 보낼지는 설정이 명시한다.
 *
 * `local` 은 **OpenAI 호환 엔드포인트**를 뜻한다(ollama·vLLM·LM Studio 가 모두 이걸 낸다).
 * 그래서 openai 와 같은 프로바이더 구현을 쓰고, baseUrl 과 인증만 다르다.
 */
export type LlmProviderName = 'claude' | 'openai' | 'local';

/** 프로바이더 하나의 접속 정보. */
export interface LlmEndpointConfig {
  /** API 키. local 은 대개 필요 없다. */
  readonly apiKey?: string;
  /**
   * 스킴+호스트까지. **버전 경로는 붙이지 않는다** — `/v1/messages` 든
   * `/v1/chat/completions` 든 프로바이더 구현이 자기 경로를 안다.
   * 그래야 게이트웨이를 갈아끼울 때 호스트만 바꾸면 된다.
   */
  readonly baseUrl: string;
  /**
   * 기본 모델. 요청이 모델을 지정하지 않으면 이 값을 쓴다.
   *
   * **openai·local 은 기본값이 없다.** 모델 이름은 계정·설치본마다 다르고, 없는 이름을
   * 코드에 박아두면 호출 시점에야 404 로 드러난다. 설정에 없으면 그 프로바이더를 못 쓴다.
   */
  readonly model?: string;
}

/**
 * LLM 설정. **값이 없으면 AI 기능만 꺼지고 부팅은 정상이다** — 슬랙 알림과 같은 태도다.
 * 병원 검색 본체는 LLM 없이 돌아야 하므로, 여기서 아무것도 검증하지 않는다.
 * 실제 실패는 호출 시점에 난다(LlmService 가 설정을 확인하고 던진다).
 */
export interface LlmConfig {
  /** 요청이 프로바이더를 지정하지 않았을 때 쓸 기본값. */
  readonly provider: LlmProviderName;
  /** 한 번의 호출을 기다리는 최대 시간(초). 초과하면 끊는다. */
  readonly timeoutSec: number;
  /**
   * 응답 최대 토큰. 이 API 는 필터 JSON 만 받으므로 크게 잡을 이유가 없다.
   * 넘치면 잘린 JSON 이 오고 파싱이 실패한다 — 그건 조용한 오답보다 낫다.
   */
  readonly maxTokens: number;
  /**
   * Claude 의 사고 깊이(low|medium|high|xhigh|max). 코드 추출은 어려운 작업이 아니라
   * 기본을 낮게 잡는다. 정확도가 아쉬우면 설정만 올리면 된다.
   * 다른 프로바이더는 이 값을 무시한다.
   */
  readonly effort: string;
  /**
   * 서비스 프롬프트 파일이 있는 디렉터리. 상대경로면 cwd·워크스페이스 루트 순으로 푼다.
   *
   * 설정으로 뺀 것은 **리빌드 없이 프롬프트만 고쳐 재적용**하려는 것이다(ES 스키마의
   * schemaDir 과 같은 결). 배포 경로의 편집 가능한 자리를 가리키면 파일만 고치고
   * 재시작하면 된다 — 프롬프트가 코드에 안 박혀 있으므로.
   */
  readonly promptDir: string;
  readonly claude: LlmEndpointConfig;
  readonly openai: LlmEndpointConfig;
  readonly local: LlmEndpointConfig;
}

export function buildLlmConfig(cfg: ConfigSource): LlmConfig {
  return Object.freeze({
    provider: (cfg.getStringOrDefault('llm.provider') ||
      'claude') as LlmProviderName,
    timeoutSec: cfg.getNumberOrDefault('llm.timeoutSec', 30),
    maxTokens: cfg.getNumberOrDefault('llm.maxTokens', 2048),
    effort: cfg.getStringOrDefault('llm.effort') || 'low',
    promptDir:
      cfg.getStringOrDefault('llm.promptDir') || 'data/healthcare/svc-prompts',
    claude: Object.freeze({
      apiKey: cfg.getStringOrDefault('llm.claude.apiKey') || undefined,
      baseUrl:
        cfg.getStringOrDefault('llm.claude.baseUrl') ||
        'https://api.anthropic.com',
      model: cfg.getStringOrDefault('llm.claude.model') || 'claude-opus-5',
    }),
    openai: Object.freeze({
      apiKey: cfg.getStringOrDefault('llm.openai.apiKey') || undefined,
      baseUrl:
        cfg.getStringOrDefault('llm.openai.baseUrl') ||
        'https://api.openai.com',
      // 기본값 없음 — 위 LlmEndpointConfig.model 주석 참고.
      model: cfg.getStringOrDefault('llm.openai.model') || undefined,
    }),
    local: Object.freeze({
      apiKey: cfg.getStringOrDefault('llm.local.apiKey') || undefined,
      baseUrl:
        // ollama 기본 포트. vLLM·LM Studio 도 같은 OpenAI 호환 경로를 낸다.
        cfg.getStringOrDefault('llm.local.baseUrl') || 'http://127.0.0.1:11434',
      model: cfg.getStringOrDefault('llm.local.model') || undefined,
    }),
  });
}
