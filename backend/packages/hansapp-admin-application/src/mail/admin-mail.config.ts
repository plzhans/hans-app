import type { ConfigSource } from '@hansapp/common';

/** 관리자 메일 설정 주입 토큰. */
export const ADMIN_MAIL_CONFIG = Symbol('ADMIN_MAIL_CONFIG');

/**
 * 관리자 메일 본문에 박히는 값. **접속·발송 설정이 아니다.**
 *
 * enabled·from·smtp 는 관리자가 화면에서 관리하므로 DB(env_setting)에 있고, 그것을 읽어
 * 발송기에 넘기는 것은 AdminMailSettingsSource 의 몫이다. 여기 남은 것은 관리자가 만질 값이
 * 아니라 서버가 어디에 떠 있는지에 딸린 값이라 설정 파일에 둔다 — 회원 메일(MailConfig)과 같은 갈래다.
 */
export interface AdminMailConfig {
  /**
   * **DB 설정을 무시하고 발송을 막는다.** 회원 메일과 같은 스위치를 그대로 따른다 —
   * 로컬에서 develop DB 를 보며 개발할 때 실제 사람에게 메일이 나가는 것을 막는 값이라,
   * 메일 종류마다 갈리면 한쪽만 막히는 사고가 난다.
   */
  readonly forceDisabled: boolean;

  /** 제목·본문에 쓰는 서비스 이름. 회원 메일과 같은 값(apps-api.name)을 쓴다. */
  readonly appName: string;

  /**
   * 관리자 콘솔 주소. 메일의 로그인 링크가 된다.
   *
   * **환경마다 달라 기본값이 없다.** 비어 있으면 링크 없이 안내만 보낸다 — 주소를 모른다고
   * 계정 안내 자체를 못 보낼 이유는 없다.
   */
  readonly consoleUrl: string;
}

export function buildAdminMailConfig(source: ConfigSource): AdminMailConfig {
  return Object.freeze({
    forceDisabled: source.getBoolOrDefault('mail.forceDisabled'),
    appName: source.getStringOrDefault('apps-api.name'),
    // 끝의 `/` 를 떼어 둔다 — 링크를 이어 붙일 때 `//` 가 되는 것을 부르는 쪽마다 막지 않도록.
    consoleUrl: source.getStringOrDefault('apps-admin-api.externalUrl', '').replace(/\/+$/, ''),
  });
}
