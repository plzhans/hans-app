import type { ConfigSource } from '@hansapp/common';

/** LLM 설정 주입 토큰 */
export const LLM_CONFIG = Symbol('LLM_CONFIG');

/**
 * 어느 업체의 API 를 부를지. 모델 이름으로 유추하지 않고 설정이 명시한다.
 *
 * `local` 은 OpenAI 호환 엔드포인트를 뜻한다(ollama·vLLM·LM Studio).
 */
export type LlmProviderName = 'anthropic' | 'openai' | 'local';

/**
 * LLM 설정. **값이 없어도 부팅은 정상이다** — 병원 검색 본체는 LLM 없이 돌아야 하므로
 * 여기서 검증하지 않는다. 실패는 호출 시점에 LlmService 가 낸다.
 */
/**
 * LLM 설정 중 **설정 파일에 남는 것들.**
 *
 * 나머지(한도·노출 스위치·업체 자격증명)는 DB 로 옮겼다 — 동작·한도는 env_setting,
 * 접속처는 llm_endpoint 다. 읽는 것은 LlmSettingsSource 이고 이 타입은 관여하지 않는다.
 *
 * 여기 남은 둘의 성격:
 *   promptDir        배포마다 다른 파일 경로다. DB 에 넣으면 서버마다 달라야 하는 값이 하나가 된다.
 *   answerSigningKey 서명 키라 설정이 아니라 서버의 신원에 가깝다. 바꾸면 진행 중인 대화가 끊긴다.
 */
export interface LlmConfig {
  /**
   * 답변 서명 키(HMAC-SHA256). **비어 있으면 답변을 문맥으로 이어받지 않는다.**
   *
   * 화면이 돌려보내는 직전 답변은 "우리가 이렇게 답했다" 는 주장이라, 서명이 없으면
   * 아무 문장이나 심어 모델을 유도할 수 있다. 없으면 서명도 안 붙이고 받지도 않는다.
   */
  readonly answerSigningKey: string;

  /** 프롬프트 파일 자리. 상대경로면 cwd → 워크스페이스 루트 순으로 찾는다. */
  readonly promptDir: string;
}

export function buildLlmConfig(cfg: ConfigSource): LlmConfig {
  return Object.freeze({
    // 기본값을 두지 않는다. 코드에 박힌 키는 없는 것과 같다.
    answerSigningKey: cfg.getStringOrDefault('llm.answerSigningKey') || '',
    promptDir:
      cfg.getStringOrDefault('llm.promptDir') || 'data/healthcare/svc-prompts',
  });
}
