import { parseSecretBoxKeys, type SecretBoxKeys } from './secret-box';
import type { ConfigSource } from './config-source';

/** 설정 값 암호화 키링 주입 토큰. */
export const SETTING_KEYRING = Symbol('SETTING_KEYRING');

/**
 * 설정 값을 잠글 키링.
 *
 * **앱 자격증명(app_llm_key)과 같은 꾸러미(appSecretEncryption)를 쓴다.** 표가 나뉘어도
 * 자물쇠를 하나로 두는 것이 이 저장소의 방침이다 — 나누면 키를 교체할 때 두 벌을 따로
 * 돌려야 하고, 한쪽만 옮긴 채 옛 키를 지우는 사고가 열린다(config.yaml 의 주석 참고).
 *
 * **비어 있으면 undefined 다.** 서버는 그대로 뜨고, 설정을 저장하거나 읽으려는 순간에만
 * 실패한다 — 이 기능을 안 쓰는 환경(배치·CLI·키를 아직 안 만든 로컬)까지 부팅을 막을
 * 이유가 없다. 대신 실패할 때는 "키링이 없다" 고 분명히 말해야 한다.
 */
export function buildSettingKeyring(source: ConfigSource): SecretBoxKeys | undefined {
  const path = 'appSecretEncryption';
  return parseSecretBoxKeys(source.getValue(path), path);
}
