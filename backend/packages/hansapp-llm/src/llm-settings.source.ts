import type { LlmProviderName } from './llm.config';

/** 설정 주입 토큰. 구현은 부르는 쪽(응용 계층)이 준다. */
export const LLM_SETTINGS_SOURCE = Symbol('LLM_SETTINGS_SOURCE');

/**
 * 실제로 부를 곳 하나.
 *
 * **업체별로 자리를 고정하지 않는다.** 예전에는 anthropic·openai·local 세 자리가 설정에
 * 박혀 있었는데, 그러면 같은 업체를 둘 이상 등록할 수가 없다 — 운영용·개발용 키를 따로
 * 두려는 것이 접속처를 목록(llm_endpoint)으로 옮긴 이유다.
 */
export interface LlmEndpointSettings {
  /** 어느 SDK 어댑터로 부를지. */
  readonly provider: LlmProviderName;
  /**
   * 자격증명을 **어떻게 실어 보내는가.** 업체가 헤더를 다르게 받는다:
   *   `apiKey`    → `x-api-key`
   *   `authToken` → `Authorization: Bearer` + oauth 베타 헤더
   *
   * **값을 보고 추측하지 않는다.** 등록할 때 고른 것이 그대로 온다.
   */
  readonly keyType: 'apiKey' | 'authToken';
  /** 잠긴 값을 연 원문. LOCAL 은 없을 수 있다(사내 Ollama 는 대개 인증이 없다). */
  readonly secret?: string;
  /** 비어 오지 않는다 — 부르는 쪽이 업체 기본 주소를 채워 넘긴다. */
  readonly baseUrl: string;
  readonly defaultModel?: string;
  /**
   * **이 키로 부를 수 있는 모델들.** 비어 있으면 `defaultModel` 하나뿐이다.
   *
   * 잠금 목록이 아니라 허용 목록인 이유는 업체가 모델을 새로 낼 때 있다 — 잠금 방식이면
   * 새 모델이 아무 장치 없이 부를 수 있는 상태로 나타난다. 모델이 곧 단가라 그건 예산이
   * 새는 자리다.
   */
  readonly allowedModels: readonly string[];
}

/**
 * 런타임에 바뀌는 LLM 설정. **파일에 남는 값은 여기 없다**(promptDir·answerSigningKey).
 */
export interface LlmSettings {
  /** 한 번의 호출을 기다리는 최대 시간(초). */
  readonly timeoutSec: number;
  /** 응답 최대 토큰. 넘치면 잘린 JSON 이 와서 호출이 실패한다. */
  readonly maxTokens: number;
  readonly appDailyTokens: number;
  readonly appMonthlyTokens: number;
  readonly userTokens: number;
  readonly allowTestCommand: boolean;
  readonly exposeDebugUsage: boolean;
  /**
   * 지정 없는 호출이 쓸 접속처. **없을 수 있다** — 하나도 등록하지 않았거나 전부 꺼 둔 경우다.
   * 그때는 호출 시점에 LlmConfigError 로 막는다(부팅은 정상이다).
   */
  readonly endpoint: LlmEndpointSettings | null;
}

/**
 * 설정을 가져오는 곳.
 *
 * **이 패키지는 값이 어디서 오는지 모른다.** 설정 파일이든 DB 든 부르는 쪽이 정한다 —
 * 그래야 호출 통로를 건드리지 않고 출처만 갈아끼울 수 있다(EmailSettingsSource 와 같은 결).
 *
 * **부를 때마다 읽는다.** 부팅 때 한 번 읽어 들고 있으면 화면에서 모델이나 한도를 바꿔도
 * 재시작 전까지 안 먹는다. 캐시를 둘지는 구현하는 쪽이 정한다.
 */
export interface LlmSettingsSource {
  load(): Promise<LlmSettings>;
}
