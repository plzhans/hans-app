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
  /**
   * 이메일·코드를 DB 에 저장할 때 HMAC 에 쓰는 pepper(서버 시크릿).
   * 미설정이면 AUTH_JWT_SECRET 을 재사용한다(별도 시크릿을 강제하지 않되, 평문 hash 는 피한다).
   */
  readonly hashSecret: string;
}

/** EnvSource 에서 OTP 정책을 뽑는다. 전부 기본값이 있어 미설정이어도 동작한다. */
export function buildOtpConfig(source: ConfigSource): OtpConfig {
  // 정책 값(비밀 아님)은 getX 로 — config/config.<환경>.yaml 또는 환경변수.
  // hashSecret 만 시크릿이라 .env 로 두고 기존 방식 유지(없으면 AUTH_JWT_SECRET 재사용).
  return Object.freeze({
    codeLength: source.getNumberOrDefault('auth.otp.codeLength', 6),
    ttlSec: source.getNumberOrDefault('auth.otp.ttlSec', 600),
    maxAttempts: source.getNumberOrDefault('auth.otp.maxAttempts', 5),
    resendCooldownSec: source.getNumberOrDefault(
      'auth.otp.resendCooldownSec',
      60,
    ),
    maxSendsPerHour: source.getNumberOrDefault('auth.otp.maxSendsPerHour', 5),
    hashSecret:
      source.getStringOrDefault('auth.otp.hashSecret') ||
      source.getString('auth.jwt.secret'),
  });
}

/**
 * SMTP 접속 설정. host 가 있어야 실제 발송이 가능하다.
 * 로컬/미설정 환경에서는 smtp 가 null 이며, 메일러는 발송 대신 콘솔 로깅으로 대체한다
 * (개발 중 코드 확인용 — 실제 발송 없이 흐름을 돌릴 수 있다).
 */
export interface SmtpConfig {
  readonly host: string;
  /** 587=STARTTLS, 465=암묵적 TLS. 기본 587 */
  readonly port: number;
  /** 465(암묵적 TLS)면 true, 587(STARTTLS)면 false. 기본 false */
  readonly secure: boolean;
  /** 인증 계정. 없으면 인증 없이 접속(사내 릴레이 등). */
  readonly user?: string;
  readonly password?: string;
}

/**
 * 메일 발송 설정. 이 계층이 스스로 정의하고 검증한다.
 *
 * SMTP 값이 없어도 부팅은 된다 — 발송이 없을 뿐이다(로컬). 운영에서 host 를 비워두면
 * 인증 메일이 안 나가므로, 배포 환경에는 반드시 채운다.
 */
export interface MailConfig {
  /** SMTP 접속 설정. host 미설정이면 null(발송 비활성 → 콘솔 로깅). */
  readonly smtp: SmtpConfig | null;

  /** 보내는 사람. RFC 5322 형식. 예: "HansApp <no-reply@plzhans.com>" */
  readonly from: string;

  /**
   * 템플릿 {{appName}}·제목 치환값. **서비스 공통 이름(APP_NAME)을 쓴다** — 메일 전용 값이 아니다.
   */
  readonly appName: string;

  /**
   * 템플릿 {{appUrl}} 치환값(로고 링크). **서비스 공개 URL(APP_PUBLIC_URL)을 그대로 쓴다** —
   * 메일 전용 값이 아니라, API 가 대외적으로 표현하는 대표 URL 이다(향후 절대링크 등에도 재사용).
   */
  readonly appUrl: string;
}

/**
 * 설정에서 메일 설정을 뽑는다. SMTP host 가 없으면 smtp=null(발송 비활성)로 둔다.
 * 나머지 브랜딩 값(from/appName/appUrl)은 기본값을 갖는다.
 */
export function buildMailConfig(source: ConfigSource): MailConfig {
  // SMTP 접속(host·user·password)은 시크릿·인프라 → .env(MAIL_SMTP_*), 브랜딩(from·appName·appUrl)은
  // 비밀 아님 → config/config.<환경>.yaml. 둘 다 계산된 트리에서 경로로 읽는다.
  const host = source.getStringOrDefault('mail.smtp.host');

  const smtp: SmtpConfig | null = host
    ? Object.freeze({
        host,
        port: source.getNumberOrDefault('mail.smtp.port', 587),
        secure: source.getBoolOrDefault('mail.smtp.secure', false),
        user: source.getStringOrDefault('mail.smtp.user') || undefined,
        password: source.getStringOrDefault('mail.smtp.password') || undefined,
      })
    : null;

  return Object.freeze({
    smtp,
    from: source.getStringOrDefault(
      'mail.from',
      'HansApp <no-reply@plzhans.com>',
    ),
    // 아래 둘은 메일 전용이 아니라 서비스 공통 값(appName·appPublicUrl)이다 — 메일은 참조만 한다.
    appName: source.getStringOrDefault('api-server.name', 'HansApp'),
    appUrl: source.getStringOrDefault(
      'api-server.web.publicUrl',
      'https://plzhans.com',
    ),
  });
}
