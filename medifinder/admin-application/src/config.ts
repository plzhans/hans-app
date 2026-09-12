/**
 * 이 계층이 받는 설정.
 *
 * hans-api 의 설정 체계(ConfigSource·env_setting)를 쓰지 않는다. MediFinder 는 그 시스템의
 * 일부가 아니라 외부 소비자라, 자기 자격증명을 자기가 들고 있어야 한다. 값을 어디서 읽을지는
 * 부르는 쪽(medifinder-cli)이 정하고, 이 계층은 완성된 객체만 받는다.
 */
import { Inject } from '@nestjs/common';

/** DI 토큰. 주입받는 쪽은 `@InjectConfig()` 를 쓴다. */
export const MEDIFINDER_CONFIG = Symbol('MEDIFINDER_CONFIG');

export const InjectConfig = (): ParameterDecorator => Inject(MEDIFINDER_CONFIG);

export interface HansApiConfig {
  /** hans-api 주소. 예: https://api.plzhans.com */
  baseUrl: string;
  /**
   * 서버-서버 자격증명. `sk_{appId}_{keyId}_{rand}`.
   *
   * X-Client-Id 를 쓰지 않는 이유는 그쪽이 WEB 타입이면 요청 Origin 을 등록 오리진과
   * 대조하기 때문이다. CLI 는 브라우저가 아니라 Origin 이 없다.
   */
  serviceKey: string;
}

export interface MedifinderConfig {
  api: HansApiConfig;
  /** 사이트맵에 적을 사이트 주소. 예: https://medifinder.kr */
  siteUrl: string;
  /**
   * 환경 이름. 예: production
   *
   * **두 곳에 쓰인다** — 산출물 디렉터리 이름과 배포할 Worker 이름이다. 둘이 같은 값이라야
   * "어느 환경 것이냐" 를 한 군데서만 정하게 된다.
   */
  appEnv: string;
}
