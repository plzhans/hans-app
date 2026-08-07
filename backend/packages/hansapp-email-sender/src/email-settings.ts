/**
 * 발송기가 알아야 하는 전부.
 *
 * **이 패키지는 값이 어디서 오는지 모른다.** 설정 파일이든 DB 든 부르는 쪽이 정하고,
 * 여기서는 `EmailSettingsSource` 한 개만 받는다 — 그래야 발송 통로를 바꾸지 않고
 * 값의 출처만 갈아끼울 수 있다.
 */

export interface SmtpSettings {
  readonly host: string;
  /** 587=STARTTLS, 465=암묵적 TLS. */
  readonly port: number;
  /** 465(암묵적 TLS)면 true, 587(STARTTLS)면 false. */
  readonly secure: boolean;
  /** 인증 계정. 없으면 인증 없이 접속(사내 릴레이 등). */
  readonly user?: string;
  readonly password?: string;
}

export interface EmailSettings {
  /**
   * 실제로 내보낼지.
   *
   * **접속 정보(smtp)와 따로 둔다.** 발송을 멈추려고 host 를 지우면 다시 켤 때 그 값을
   * 어디서 가져오는지가 문제가 된다.
   */
  readonly enabled: boolean;

  /** 보내는 사람. RFC 5322 형식. 예: "HansApp <no-reply@example.com>" */
  readonly from: string;

  /** 접속 설정. null 이면 보낼 곳이 없다 → 발송 대신 콘솔에 찍는다. */
  readonly smtp: SmtpSettings | null;
}

/** 설정 주입 토큰. 구현은 부르는 쪽이 준다. */
export const EMAIL_SETTINGS_SOURCE = Symbol('EMAIL_SETTINGS_SOURCE');

/**
 * 설정을 가져오는 곳.
 *
 * **발송할 때마다 부른다.** 부팅 때 한 번 읽어 들고 있으면 값을 바꿔도 재시작 전까지
 * 안 먹는다 — 캐시를 둘지, 얼마나 둘지는 구현하는 쪽이 정한다.
 */
export interface EmailSettingsSource {
  load(): Promise<EmailSettings>;
}
