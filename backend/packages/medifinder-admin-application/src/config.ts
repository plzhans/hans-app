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

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 객체 키 접두사. 워커가 APP_ENV 로 같은 값을 만들어 읽는다. */
  prefix: string;
}

export interface MedifinderConfig {
  api: HansApiConfig;
  /** 사이트맵에 적을 사이트 주소. 예: https://medifinder.kr */
  siteUrl: string;
  /**
   * 없을 수 있다. **sitemap build 는 R2 자격증명 없이 돌아야 한다** — 만들기만 하는 자리에
   * 업로드 권한을 요구하면 CI 에서 잡을 나눌 수 없고, 로컬에서 파일 모양만 보려는 사람도
   * 자격증명을 구해야 한다. 없으면 업로드하는 순간에 드러난다.
   */
  r2?: R2Config;
}

/**
 * R2 설정을 꺼낸다. 없으면 여기서 죽는다.
 *
 * 업로드 직전에 부른다 — 파일을 다 만든 뒤에 자격증명이 없다고 죽는 편이,
 * 만들지도 않고 죽는 것보다 낫다. 산출물은 남으므로 자격증명만 채워 다시 올리면 된다.
 */
export function requireR2(config: MedifinderConfig): R2Config {
  if (!config.r2) {
    throw new Error('R2 credentials are not configured. Set MEDIFINDER_R2_* to upload.');
  }
  return config.r2;
}
