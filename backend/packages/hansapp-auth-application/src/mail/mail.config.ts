import type { ConfigSource } from '@hansapp/common';

/** 메일 설정 주입 토큰. */
export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

/** OTP(이메일 인증 코드) 정책 주입 토큰. */
export const OTP_CONFIG = Symbol('OTP_CONFIG');

/**
 * 이메일 인증 코드(OTP) 정책. 코드는 엔트로피가 낮으므로(6자리) 짧은 TTL·시도제한·재발송
 * 쿨다운으로 무차별 대입을 막는다. 이 값들은 메일 템플릿의 {{expiresMinutes}} 안내와 맞춰야 한다.
 */
export interface OtpConfig {
  /** 코드 자릿수(숫자). 기본 6 */
  readonly codeLength: number;
  /** 코드 유효시간(초). 기본 600(10분). 템플릿 {{expiresMinutes}} 와 일치시킬 것. */
  readonly ttlSec: number;
  /** 코드 하나당 허용 검증 시도 횟수. 초과하면 코드를 폐기한다. 기본 5 */
  readonly maxAttempts: number;
  /** 같은 이메일로 코드를 다시 받을 수 있는 최소 간격(초). 기본 60 */
  readonly resendCooldownSec: number;
  /** 같은 이메일로 1시간 동안 보낼 수 있는 최대 통수. 초과하면 발송을 거부한다. 기본 5 */
  readonly maxSendsPerHour: number;
  /** 이메일·코드를 DB 에 저장할 때 HMAC 에 쓰는 pepper. `auth.jwt.secret` 을 그대로 쓴다. */
  readonly hashSecret: string;
}

/** EnvSource 에서 OTP 정책을 뽑는다. 전부 기본값이 있어 미설정이어도 동작한다. */
export function buildOtpConfig(source: ConfigSource): OtpConfig {
  return Object.freeze({
    codeLength: source.getNumberOrDefault('auth.otp.codeLength'),
    ttlSec: source.getNumberOrDefault('auth.otp.ttlSec'),
    maxAttempts: source.getNumberOrDefault('auth.otp.maxAttempts'),
    resendCooldownSec: source.getNumberOrDefault('auth.otp.resendCooldownSec'),
    maxSendsPerHour: source.getNumberOrDefault('auth.otp.maxSendsPerHour'),
    hashSecret: source.getString('auth.jwt.secret'),
  });
}

/**
 * 메일 본문에 박히는 값. **접속·발송 설정이 아니다.**
 *
 * enabled·from·smtp 는 관리자가 화면에서 관리하므로 DB 에 있고(env_setting), 그것을 읽어
 * 발송기에 넘기는 것은 MailSettingsSource 의 몫이다. 여기 남은 둘은 관리자가 만질 값이 아니라
 * 서비스 공통 값(apps-api.*)이라 설정 파일에 둔다.
 */
export interface MailConfig {
  /**
   * **DB 설정을 무시하고 발송을 막는다.** 이 저장소에서 설정 파일이 DB 를 이기는 유일한 값이다.
   *
   * 로컬 개발을 위한 것이다 — DB 는 develop 과 같은 것을 볼 때가 많은데, 거기서 메일이 켜져
   * 있으면 코드를 만지다 실제 사용자에게 메일이 나간다. 화면에서 끄면 develop 서버까지 같이
   * 꺼지므로, **그 환경에서만 듣는 스위치**가 따로 필요하다.
   *
   * 켜면 발송 대신 본문을 콘솔에 찍는다(꺼져 있을 때와 같은 동작).
   * 기본은 꺼짐 — 배포 환경에서 실수로 메일이 멎지 않게.
   */
  readonly forceDisabled: boolean;

  /**
   * 템플릿 {{appName}}·제목 치환값. **서비스 공통 이름(APP_NAME)을 쓴다** — 메일 전용 값이 아니다.
   */
  readonly appName: string;

  /**
   * 템플릿 {{appUrl}} 치환값(로고 링크). **서비스 공개 URL(APP_PUBLIC_URL)을 그대로 쓴다** —
   * 메일 전용 값이 아니라, API 가 대외적으로 표현하는 대표 URL 이다.
   */
  readonly appUrl: string;
}

export function buildMailConfig(source: ConfigSource): MailConfig {
  return Object.freeze({
    // **설정 파일에만 있다.** DB 로 옮기면 화면에서 끌 수 있게 되는데, 그러면 "이 서버에서만
    // 막는다" 는 뜻 자체가 사라진다(모든 서버가 같은 DB 를 본다).
    forceDisabled: source.getBoolOrDefault('mail.forceDisabled'),
    // 메일 전용이 아니라 서비스 공통 값(appName·appPublicUrl)이다 — 메일은 참조만 한다.
    appName: source.getStringOrDefault('apps-api.name'),
    appUrl: source.getStringOrDefault('apps-api.externalUrl', 'https://console.plzhans.com'),
  });
}
