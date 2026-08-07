import { parseSecretBoxKeys, type SecretBoxKeys } from '@hansapp/common';
import type { ConfigSource } from '@hansapp/common';

/** 앱 자격증명 암호화 설정 주입 토큰. */
export const APP_SECRET_CONFIG = Symbol('APP_SECRET_CONFIG');

/**
 * 앱이 등록한 외부 자격증명을 잠그는 마스터 키 꾸러미.
 *
 * **표는 나뉘어도 자물쇠는 하나다.** app_llm_key 와 app_external_key 가 같은 꾸러미를 쓴다 —
 * 나누면 키를 교체할 때 두 벌을 따로 돌려야 하고, 한쪽만 옮긴 채 옛 키를 지우는 사고가 열린다.
 * 나뉘어야 하는 것은 저장 구조이지 암호화 키가 아니다.
 *
 * **없어도 부팅은 정상이다**(undefined). 키 등록만 501 로 막힌다 — 부가 기능이라 마스터 키를
 * 안 넣었다고 서버 전체가 못 뜨면 안 된다. 반대로 **키가 없는데 저장은 되는** 상태가 제일
 * 나쁘므로, 서비스는 여기가 비면 저장 경로를 통째로 거절한다.
 */
export interface AppSecretConfig {
  readonly keyring?: SecretBoxKeys;
}

/** 설정에서 마스터 키 꾸러미를 뽑는다. 값이 깨져 있으면 부팅을 거부한다(빈 값은 미설정). */
export function buildAppSecretConfig(source: ConfigSource): AppSecretConfig {
  const path = 'appSecretEncryption';
  return Object.freeze({
    keyring: parseSecretBoxKeys(source.getValue(path), path),
  });
}
