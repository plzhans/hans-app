import type { ConfigSource } from '@hansapp/common';

/** LLM 설정 주입 토큰 */
export const LLM_CONFIG = Symbol('LLM_CONFIG');

/**
 * 어느 업체의 API 를 부를지. 모델 이름으로 유추하지 않고 설정이 명시한다.
 *
 * `local` 은 OpenAI 호환 엔드포인트를 뜻한다(ollama·vLLM·LM Studio).
 */
export type LlmProviderName = 'anthropic' | 'openai' | 'local';

/** 프로바이더 하나의 접속 정보. */
export interface LlmEndpointConfig {
  /** API 키. local 은 대개 필요 없다. */
  readonly apiKey?: string;
  /**
   * 구독 계정의 OAuth 토큰(Anthropic 전용). `claude setup-token` 으로 발급한다.
   *
   * **로컬 전용이다** — 개인 구독에 달린 토큰이라 서비스 트래픽을 태울 자리가 아니다.
   * apiKey 와 둘 다 있으면 apiKey 가 이긴다.
   */
  readonly authToken?: string;
  /**
   * 스킴+호스트까지. 버전 경로(`/v1`)는 LlmService 가 붙인다.
   *
   * **기본값이 코드에 있다** — 게이트웨이를 끼우거나 로컬 런타임을 다른 포트에 올린 게
   * 아니면 적을 이유가 없다. defaultModel 과 달리 박아 둬도 되는 것은, 업체 주소는
   * 은퇴하지도 않고 틀려도 요금이 아니라 접속 실패로 즉시 드러나기 때문이다.
   */
  readonly baseUrl: string;
  /**
   * 이 프로바이더로 부를 모델. `prepare()` 의 인자가 없으면 이 값을 쓴다.
   *
   * 업체 API 는 `model` 이 필수라 **비면 400 이다** — 생략했을 때 알아서 골라 주는 기본
   * 모델은 없다(모델이 곧 가격이라 업체가 대신 정하지 않는다).
   *
   * **기본값은 코드가 아니라 yaml 이 갖는다**(`${ANTHROPIC_DEFAULT_MODEL:claude-haiku-4-5}`).
   * 그래야 "왜 이 모델로 나가지" 의 답이 설정 파일에 있다. 거기까지 비면 `prepare()` 가
   * `LlmConfigError` 로 막는다 — 잘못된 모델로 나가느니 안 나가는 게 낫다.
   *
   * 설정에 적는 값은 **날짜 없는 별칭**이어야 한다. 스냅샷 ID 는 은퇴하고, 그날 아무도
   * 설정을 안 건드린 배포가 조용히 404 를 맞는다.
   */
  readonly defaultModel?: string;
}

/**
 * LLM 설정. **값이 없어도 부팅은 정상이다** — 병원 검색 본체는 LLM 없이 돌아야 하므로
 * 여기서 검증하지 않는다. 실패는 호출 시점에 LlmService 가 낸다.
 */
export interface LlmConfig {
  /** prepare() 가 프로바이더를 지정받지 않으면 이 값을 쓴다. */
  readonly defaultProvider: LlmProviderName;
  /** 한 번의 호출을 기다리는 최대 시간(초). */
  readonly timeoutSec: number;
  /** 응답 최대 토큰. 넘치면 잘린 JSON 이 와서 호출이 실패한다. */
  readonly maxTokens: number;
  /**
   * **앱 하나가 하루에 쓸 수 있는 토큰 수**(입력+출력). 0 이하면 제한 없음.
   *
   * **호출 수가 아니라 토큰인 이유**는 호출 하나의 크기가 제각각이어서다. 짧은 질문과
   * 긴 대화가 같은 1 회로 세어지면 상한이 요금과 안 맞고, 나중에 "충전한 만큼 쓴다" 로
   * 갈 때 단위를 갈아엎어야 한다. 요금이 붙는 단위로 처음부터 세는 편이 낫다.
   *
   * **월 한도와 같이 건다.** 진짜 예산은 월이고(appMonthlyTokens) 이 값은 그것이 하루
   * 만에 타 버리지 않게 막는 둑이다 — 월만 걸면 첫날에 바닥나고, 일만 걸면 매일 꽉
   * 채워 쓸 때 월 예산을 넘긴다. 둘 중 먼저 차는 쪽이 막는다.
   *
   * IP 당 rate limit 이 못 막는 것을 막는다 — 그쪽은 한 명이 얼마나 빨리 부르는지를 묶을
   * 뿐이라 IP 를 돌리면 총액이 그대로 늘어난다. 브라우저는 CORS 로 막혀도 curl 은 안 막힌다.
   *
   * **앱(appId)마다 통이 갈린다.** 하나가 다 써도 다른 앱은 살아 있다 — 파트너가 퍼가도
   * 우리 웹앱은 돈다. 같은 앱 안에서는 브라우저든 서버 키든 한 통을 쓴다(정산 주체가 앱이다).
   *
   * 로그인 전 사용자는 같은 앱을 쓰므로 한 통을 나눠 쓰게 된다 — 로그인이 붙으면
   * 그 사람 몫(userDailyTokens)으로 옮겨 간다.
   *
   * **이 값을 LlmService 가 보지 않는다.** 대행자는 실행만 하고, 누가 얼마나 쓸 수 있는지는
   * 부르는 계층이 정한다 — 같은 LLM 을 다른 기능이 쓰기 시작하면 몫도 기능마다 다르다.
   */
  readonly appDailyTokens: number;
  /**
   * **앱 하나가 한 달에 쓸 수 있는 토큰 수.** 0 이하면 제한 없음.
   *
   * 우리가 실제로 감당하기로 한 예산이 이쪽이다 — 하루 한도는 이걸 고르게 쓰게 만드는
   * 장치일 뿐이다. 달(KST)이 바뀌면 저절로 리셋된다.
   */
  readonly appMonthlyTokens: number;
  /**
   * 사람 한 명이 쓸 수 있는 토큰 수. **로그인이 붙어야 의미가 있다** — 그전까지는 식별할
   * 주체가 없어 앱 몫만 걸린다. 0 이하면 제한 없음.
   *
   * **여기는 월·일을 안 나눈다.** 앱 몫은 우리 예산이라 고르게 쓰이도록 나눠 잠가야 하지만,
   * 이건 사용자가 충전해서 자기 것을 쓰는 자리다 — 언제 얼마나 쓸지는 그 사람이 정한다.
   * 그래서 리셋도 없다(`balance` 창).
   *
   * 설정값인 것은 **로그인·결제가 붙기 전까지의 임시**다. 붙으면 사람마다 다른 값이라
   * DB 에서 온다.
   */
  readonly userTokens: number;
  /**
   * 질문 끝의 `/test` 를 **답변 모드 전환으로 받아들일지.** 기본은 꺼짐이다.
   *
   * 로그인이 붙기 전까지 "유료 사용자" 를 흉내 내는 임시 수단이라, 켜져 있으면 **누구나**
   * 유료로 팔 답변을 공짜로 받는다 — 운영에서는 반드시 꺼져 있어야 한다.
   *
   * 로그인·토큰 잔액이 생기면 이 스위치는 사라지고, 그 자리를 사용자 잔액이 대신한다.
   */
  readonly allowTestCommand: boolean;
  /**
   * 응답에 **원시 사용량(모델 이름·토큰 내역)을 실을지.** 기본은 꺼짐이다.
   *
   * 사용자에게 파는 단위는 환산된 크레딧 하나뿐이고, 어느 모델로 몇 토큰을 썼는지는
   * 우리 원가 구조다 — 드러나면 요금을 역산할 수 있고, 모델을 바꾸는 것만으로
   * "왜 비싸졌냐" 가 된다.
   *
   * **화면에서 감추는 것으로는 안 감춰진다**(응답 JSON 에 그대로 있다). 그래서 여기서
   * 아예 안 싣는다. 켜는 곳은 로컬·개발뿐이다.
   */
  readonly exposeDebugUsage: boolean;
  /*
    사고 깊이(effort)는 여기 없다. **작업의 성질이지 환경의 성질이 아니라서다** —
    dev 는 얕게, prod 는 깊게 생각할 이유가 없고 그러면 dev 테스트가 prod 를 대변하지도
    못한다. 게다가 모델과 짝이라(안 받는 모델에 실으면 400) 설정에서 둘이 떨어져 있으면
    모델만 바꿨다가 깨진다.

    필요해지면 LlmPrepareInput 으로 받는다 — 무엇을 얼마나 생각시킬지는 무엇을 묻는지
    아는 호출부가 정한다.
  */
  /**
   * 서비스 프롬프트 파일 디렉터리. 상대경로면 cwd·워크스페이스 루트 순으로 푼다.
   * 설정으로 뺀 것은 리빌드 없이 프롬프트만 고쳐 재시작하기 위해서다.
   */
  readonly promptDir: string;
  /** 키는 업체 이름이다(모델 이름 claude 가 아니라). */
  readonly anthropic: LlmEndpointConfig;
  readonly openai: LlmEndpointConfig;
  readonly local: LlmEndpointConfig;
}

export function buildLlmConfig(cfg: ConfigSource): LlmConfig {
  const endpoint = (
    name: LlmProviderName,
    fallbackBaseUrl: string,
  ): LlmEndpointConfig =>
    Object.freeze({
      apiKey: cfg.getStringOrDefault(`llm.${name}.apiKey`) || undefined,
      authToken: cfg.getStringOrDefault(`llm.${name}.authToken`) || undefined,
      baseUrl: cfg.getStringOrDefault(`llm.${name}.baseUrl`) || fallbackBaseUrl,
      // 기본값은 yaml 이 갖는다(LlmEndpointConfig.defaultModel 주석).
      defaultModel:
        cfg.getStringOrDefault(`llm.${name}.defaultModel`) || undefined,
    });

  return Object.freeze({
    defaultProvider: (cfg.getStringOrDefault('llm.defaultProvider') ||
      'anthropic') as LlmProviderName,
    timeoutSec: cfg.getNumberOrDefault('llm.timeoutSec', 30),
    maxTokens: cfg.getNumberOrDefault('llm.maxTokens', 2048),
    // 한 번 물으면 1만 토큰 안팎이다 — 하루 200 번, 한 달 2,000 번쯤 되는 상한이다.
    appDailyTokens: cfg.getNumberOrDefault('llm.appDailyTokens', 2_000_000),
    appMonthlyTokens: cfg.getNumberOrDefault(
      'llm.appMonthlyTokens',
      20_000_000,
    ),
    // 로그인이 없으니 기본은 꺼 둔다. 붙으면 DB 에서 온다.
    userTokens: cfg.getNumberOrDefault('llm.userTokens', 0),
    // **기본은 꺼짐이다.** 설정을 빠뜨린 환경에서 켜져 있는 것이 최악이다.
    allowTestCommand: cfg.getBoolOrDefault('llm.allowTestCommand', false),
    exposeDebugUsage: cfg.getBoolOrDefault('llm.exposeDebugUsage', false),
    promptDir:
      cfg.getStringOrDefault('llm.promptDir') || 'data/healthcare/svc-prompts',
    anthropic: endpoint('anthropic', 'https://api.anthropic.com'),
    openai: endpoint('openai', 'https://api.openai.com'),
    // ollama 기본 포트. vLLM·LM Studio 도 같은 경로를 낸다.
    local: endpoint('local', 'http://127.0.0.1:11434'),
  });
}
