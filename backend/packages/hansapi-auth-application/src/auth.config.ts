import {
  EnvSource,
  optionalNumber,
  optionalString,
  requireString,
} from '@hansapi/common';

/** 인증 설정 주입 토큰 */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/**
 * 인증 응용 계층이 필요로 하는 설정. 이 계층이 스스로 정의하고 검증한다.
 *
 * JWT_SECRET 은 필수다(없으면 부팅 거부). 나머지 만료·보존 값은 기본값을 둔다.
 * 소셜 provider 설정은 별도(OAuthProviderConfig)로 분리한다 — 키가 없어도 이메일 인증은 떠야 하므로.
 */
export interface AuthConfig {
  /** access token(JWT, HS256) 서명 비밀키 */
  readonly jwtSecret: string;

  /** access token 만료(초). 기본 1시간 */
  readonly accessTokenTtlSec: number;

  /** refresh token 만료(초). 기본 60일. rotate 마다 이 값으로 연장(sliding) */
  readonly refreshTokenTtlSec: number;

  /** 소셜 콜백→프론트 릴레이 인가코드 만료(초). 기본 30초 */
  readonly authCodeTtlSec: number;

  /** 이메일 인증 토큰 만료(초). 기본 24시간 */
  readonly emailVerifyTtlSec: number;

  /** 비밀번호 재설정 토큰 만료(초). 기본 1시간 */
  readonly passwordResetTtlSec: number;

  /** 탈퇴 기록 보존일수. 이후 배치가 정리하며 이메일 재사용을 푼다. 기본 30일 */
  readonly withdrawalRetentionDays: number;

  /**
   * 허용 오리진 목록(AUTH_ALLOWED_ORIGINS). CORS 뿐 아니라 소셜 return_to(로그인 후 복귀 URL)
   * 검증에도 쓴다 — 여기 없는 오리진으로는 코드를 실어 리다이렉트하지 않는다(오픈 리다이렉트 방지).
   */
  readonly allowedOrigins: readonly string[];

  /** bcrypt 코스트(라운드). 기본 10 */
  readonly bcryptRounds: number;

  /** 소셜 로그인 설정. provider 별 키는 있는 것만 담긴다(없으면 그 provider 는 비활성). */
  readonly oauth: OAuthConfig;
}

/** 소셜 provider 자격증명. clientId·clientSecret 이 모두 있어야 활성화된다. */
export interface OAuthProviderCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface OAuthConfig {
  // redirect_uri 는 별도 base URL 을 두지 않고 요청이 들어온 호스트에서 조립한다
  // ({scheme}://{host}/auth/:provider/callback, SocialAuthGuard 참고).
  readonly google?: OAuthProviderCredentials;
  readonly naver?: OAuthProviderCredentials;
  readonly kakao?: OAuthProviderCredentials;
  readonly line?: OAuthProviderCredentials;
}

/** provider 자격증명을 EnvSource 에서 뽑는다. 둘 다 있어야 credentials 를 반환한다. */
function readProviderCredentials(
  source: EnvSource,
  idKey: string,
  secretKey: string,
): OAuthProviderCredentials | undefined {
  const clientId = optionalString(source, idKey);
  const clientSecret = optionalString(source, secretKey);
  if (!clientId || !clientSecret) {
    return undefined;
  }
  return Object.freeze({ clientId, clientSecret });
}

/**
 * EnvSource 에서 인증 설정을 뽑아 검증한다.
 * JWT_SECRET 이 없으면 부팅 시점에 즉시 실패한다.
 */
export function buildAuthConfig(source: EnvSource): AuthConfig {
  return Object.freeze({
    jwtSecret: requireString(source, 'AUTH_JWT_SECRET'),
    accessTokenTtlSec: optionalNumber(
      source,
      'AUTH_ACCESS_TOKEN_TTL_SEC',
      3600,
    ),
    refreshTokenTtlSec: optionalNumber(
      source,
      'AUTH_REFRESH_TOKEN_TTL_SEC',
      60 * 24 * 60 * 60,
    ),
    authCodeTtlSec: optionalNumber(source, 'AUTH_CODE_TTL_SEC', 30),
    emailVerifyTtlSec: optionalNumber(
      source,
      'AUTH_EMAIL_VERIFY_TTL_SEC',
      24 * 60 * 60,
    ),
    passwordResetTtlSec: optionalNumber(
      source,
      'AUTH_PASSWORD_RESET_TTL_SEC',
      60 * 60,
    ),
    withdrawalRetentionDays: optionalNumber(
      source,
      'AUTH_WITHDRAWAL_RETENTION_DAYS',
      30,
    ),
    allowedOrigins: (optionalString(source, 'AUTH_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    bcryptRounds: optionalNumber(source, 'AUTH_BCRYPT_ROUNDS', 10),
    oauth: Object.freeze({
      google: readProviderCredentials(
        source,
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET',
      ),
      naver: readProviderCredentials(
        source,
        'NAVER_OAUTH_CLIENT_ID',
        'NAVER_OAUTH_CLIENT_SECRET',
      ),
      kakao: readProviderCredentials(
        source,
        'KAKAO_OAUTH_CLIENT_ID',
        'KAKAO_OAUTH_CLIENT_SECRET',
      ),
      line: readProviderCredentials(
        source,
        'LINE_OAUTH_CLIENT_ID',
        'LINE_OAUTH_CLIENT_SECRET',
      ),
    }),
  });
}
