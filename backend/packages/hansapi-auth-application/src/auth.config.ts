import {
  EnvSource,
  optionalNumber,
  optionalString,
  requireString,
} from '@hansapi/common';

/** 인증 설정 주입 토큰 */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/**
 * API 접근 캐시 설정 주입 토큰. AccessCache 는 AuthConfig 전체가 아니라 이 조각만 받는다
 * (필요한 것만 주입해 의존을 좁힌다).
 */
export const ACCESS_CACHE_CONFIG = Symbol('ACCESS_CACHE_CONFIG');

/**
 * 1st-party 허용 오리진 목록 주입 토큰(= AuthConfig.allowedOrigins).
 * FirstPartyGuard 는 설정 전체가 아니라 이 목록만 받는다.
 */
export const ALLOWED_ORIGINS = Symbol('ALLOWED_ORIGINS');

/**
 * API 접근 캐시(서비스 키·클라이언트) TTL. 인증마다 DB 를 때리지 않으려는 2단 캐시의 설정이다.
 *   프로세스 메모리(memoryTtlSec) → 공유 캐시 Redis(sharedTtlSec) → DB
 *
 * TTL 을 짧게 두는 이유: 무효화(키 삭제·재발급)와 조회가 겹치면 **조회가 옛 값을 캐시에 다시
 * 심을 수 있다**(cache-aside 경쟁). 이 창을 원천 차단하려면 SET NX 가 필요한데 cache-manager 에는
 * 없다. 그래서 "완전 차단" 대신 **TTL 로 피해를 한정**한다 — 최악이라도 sharedTtlSec 안에 자가 치유된다.
 */
export interface AccessCacheConfig {
  /**
   * 프로세스 메모리 TTL(초). 기본 300(5분).
   * 인스턴스마다 따로라, 무효화가 다른 인스턴스에 퍼지는 지연이 곧 이 값이다.
   */
  readonly memoryTtlSec: number;

  /**
   * 프로세스 메모리 캐시 최대 엔트리 수. 기본 10000. 초과하면 LRU 로 가장 오래된 것부터 버린다.
   * **없으면 무한 증식한다** — 존재하지 않는 키/clientId 조회도 "없음"으로 캐싱되므로,
   * 무작위 값을 계속 던지면 메모리가 계속 불어난다. 그 상한이다.
   */
  readonly memoryMaxEntries: number;

  /**
   * 공유 캐시(Redis) TTL(초). 기본 600(10분).
   * 메모리 캐시가 만료돼도 여기서 받으므로 DB 조회는 이 주기로만 일어난다
   * (키 하나당 10분에 1회 수준이라 부하가 아니다).
   */
  readonly sharedTtlSec: number;
}

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

  /** 탈퇴 기록 보존일수. 이후 배치가 정리하며 이메일 재사용을 푼다. 기본 30일 */
  readonly withdrawalRetentionDays: number;

  /** API 접근 캐시(서비스 키·클라이언트) TTL 설정. */
  readonly accessCache: AccessCacheConfig;

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
 * 카카오 자격증명. 카카오는 **REST API 키를 client_id(KAKAO_CLIENT_ID)로** 쓰고,
 * client secret(KAKAO_CLIENT_SECRET)은 선택이다(콘솔 '카카오 로그인 > 보안'에서 켰을 때만).
 * JS 키는 브라우저 SDK 용이라 서버 리다이렉트 로그인엔 쓰지 않는다. client_id 만 있으면 활성화한다.
 */
function readKakaoCredentials(
  source: EnvSource,
): OAuthProviderCredentials | undefined {
  const clientId = optionalString(source, 'KAKAO_CLIENT_ID');
  if (!clientId) {
    return undefined;
  }
  return Object.freeze({
    clientId,
    clientSecret: optionalString(source, 'KAKAO_CLIENT_SECRET') ?? '',
  });
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
    accessCache: Object.freeze({
      memoryTtlSec: optionalNumber(
        source,
        'AUTH_ACCESS_CACHE_MEMORY_TTL_SEC',
        5 * 60,
      ),
      memoryMaxEntries: optionalNumber(
        source,
        'AUTH_ACCESS_CACHE_MEMORY_MAX',
        10_000,
      ),
      sharedTtlSec: optionalNumber(
        source,
        'AUTH_ACCESS_CACHE_SHARED_TTL_SEC',
        10 * 60,
      ),
    }),
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
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ),
      naver: readProviderCredentials(
        source,
        'NAVER_CLIENT_ID',
        'NAVER_CLIENT_SECRET',
      ),
      kakao: readKakaoCredentials(source),
      line: readProviderCredentials(
        source,
        'LINE_CLIENT_ID',
        'LINE_CLIENT_SECRET',
      ),
    }),
  });
}
