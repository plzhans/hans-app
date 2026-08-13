import type { ConfigSource } from '@hansapp/common';

import { normalizeRootDomain } from './first-party-origin';

/** 인증 설정 주입 토큰 */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/**
 * API 접근 캐시 설정 주입 토큰. AccessCache 는 AuthConfig 전체가 아니라 이 조각만 받는다
 * (필요한 것만 주입해 의존을 좁힌다).
 */
export const ACCESS_CACHE_CONFIG = Symbol('ACCESS_CACHE_CONFIG');

/** 세션 캐시 설정 주입 토큰. SessionCache 도 AuthConfig 전체가 아니라 이 조각만 받는다. */
export const SESSION_CACHE_CONFIG = Symbol('SESSION_CACHE_CONFIG');

/** 내 정보 캐시 설정 주입 토큰. */
export const PROFILE_CACHE_CONFIG = Symbol('PROFILE_CACHE_CONFIG');

/**
 * 로그인 세션 캐시 TTL. 구조는 API 접근 캐시와 같다(메모리 → Redis → DB).
 *
 * **값을 따로 두는 이유가 있다.** 이 TTL 은 "관리자가 세션을 끊고 나서 실제로 막히기까지"
 * 의 시간이다. 서비스 키 캐시가 5분 늦는 것과 폐기된 세션이 5분 더 사는 것은 무게가 다르다.
 *
 * **두 단을 같은 값으로 둔다.** 폐기는 이벤트로 즉시 퍼지지만, 큐가 죽어 이벤트가
 * 유실되면 남는 것은 TTL 뿐이다. Redis 를 길게 잡으면 그 최악이 곧 Redis TTL 이 된다 —
 * 같은 값이면 어느 경로로 실패하든 지연이 이 한 값을 넘지 않는다.
 */
export interface SessionCacheConfig {
  /** 프로세스 메모리 TTL(초). 기본 60. */
  readonly memoryTtlSec: number;
  /** 공유 캐시(Redis) TTL(초). 기본 60. */
  readonly sharedTtlSec: number;
  /** 메모리 캐시 상한. 모르는 sid 조회도 "없음" 으로 캐싱되므로 상한이 필요하다. */
  readonly memoryMaxEntries: number;
}

/**
 * `/users/me` 응답 캐시 TTL. 구조는 세션 캐시와 같다.
 *
 * **TTL 은 안전망이다.** 이 응답을 이루는 값(이름·언어·소셜 연동·비밀번호 유무…)이 바뀔 때
 * 쓰기 경로가 캐시를 비우는 것이 정석이고, TTL 은 그중 하나를 빠뜨렸을 때 스스로 낫는
 * 시간이다. 짧게 잡는 이유가 그것이라 세션 캐시와 같은 값을 쓴다.
 */
export type ProfileCacheConfig = SessionCacheConfig;

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
/** 약관·방침의 현재 판. 문서의 시행일 문자열을 그대로 쓴다(예: '2026-08-06'). */
export interface ConsentVersions {
  readonly terms: string;
  readonly privacy: string;
}

export interface AuthConfig {
  /**
   * 대칭 서명 비밀키. 소셜 티켓(HS256)·메일 OTP pepper·토큰 HMAC 태그에 쓴다.
   * access token 은 jwtKeyDir 이 있으면 비대칭(ES256)으로, 없으면 이 키로 HS256 폴백한다.
   */
  readonly jwtSecret: string;

  /**
   * access token 비대칭 서명 키 디렉터리(AUTH_JWT_KEY_DIR). MSA 대비 — 소비자는 공개키(JWKS)로 검증.
   *   `<kid>_<alg>.key`(활성 개인키) · `retired/<kid>_<alg>.pub`(검증 전용 공개키)
   * 없으면 access token 을 HS256(jwtSecret) 로 발급한다(레거시/미이관 환경).
   */
  readonly jwtKeyDir?: string;

  /** access token 발급자(iss, AUTH_ISSUER). **서명 때 박는 자기 발급처 하나.** JWKS discovery 기준 URL 이기도 하다. 미설정이면 iss 를 넣지 않는다. */
  readonly issuer?: string;

  /**
   * OAuth2 authorization_endpoint. **인증웹(fe/hans-auth) 로그인 URL**.
   * 예: https://auth.plzhans.com/login. discovery 에 실린다. 미설정이면 authorization_endpoint 를 뺀다.
   */
  /**
   * OIDC discovery 의 `authorization_endpoint`. **externalUrl 에서 파생한다**(`+ /login`).
   * 따로 설정하지 않는다 — 인증웹 주소가 둘로 갈리면 어긋날 수 있고, 실제로 어긋났었다.
   */
  readonly authorizeUrl?: string;
  /**
   * 인증웹(fe/hans-auth) 외부 주소. 예 `https://auth.plzhans.com`
   * (로컬은 포털 아래 마운트라 `http://127.0.0.1:5274/auth`).
   *
   * 자사 로그인이 끝난 사용자를 어디로 내려놓을지(`/me`·`/callback`)와 discovery 의
   * authorization_endpoint(`/login`)가 모두 이 값에서 나온다.
   */
  readonly externalUrl?: string;

  /**
   * access token 검증 때 **허용할 iss 목록**(AUTH_ALLOWED_ISSUERS, 콤마구분). 자기 issuer 는 자동 포함된다.
   * 로컬이 dev DB 에 붙어 로컬(127.0.0.1)·dev 양쪽 발급 토큰을 다 받아야 하는 경우처럼 발급처가 여럿일 때 쓴다.
   * 비면 iss 검증을 하지 않는다(issuer 도 없을 때).
   */
  readonly allowedIssuers: readonly string[];

  /** access token 만료(초). 기본 1시간 */
  readonly accessTokenTtlSec: number;

  /** refresh token 만료(초). 기본 60일. rotate 마다 이 값으로 연장(sliding) */
  readonly refreshTokenTtlSec: number;

  /** 소셜 콜백→프론트 릴레이 인가코드 만료(초). 기본 30초 */
  readonly authCodeTtlSec: number;

  /** 탈퇴 기록 보존일수. 이후 배치가 정리하며 이메일 재사용을 푼다. 기본 30일 */
  readonly withdrawalRetentionDays: number;

  /**
   * 한 사용자가 동시에 유지할 수 있는 로그인 세션 수. 기본 10.
   *
   * 넘치면 오래된 것부터 지운다 — 브라우저를 바꿔 가며 로그인하다 보면 세션 행이 계속
   * 쌓이는데, 만료 정리만으로는 만료 전까지 그대로 남는다. 0 이하면 상한을 두지 않는다.
   */
  readonly maxSessionsPerUser: number;

  /** API 접근 캐시(서비스 키·클라이언트) TTL 설정. */
  readonly accessCache: AccessCacheConfig;

  /** 로그인 세션 캐시 TTL 설정. */
  readonly sessionCache: SessionCacheConfig;

  /** 내 정보 응답 캐시 TTL 설정. */
  readonly profileCache: ProfileCacheConfig;

  /**
   * 서비스 루트 도메인(APP_ROOT_DOMAIN, 예: `plzhans.com`, 앞 점 없이). **설정 하나로 파생되는 값들:**
   *  - SSO refresh/hint 쿠키의 Domain (서브도메인 공유; refresh-cookie.ts)
   *  - 1st-party 판단 = redirect_uri host 가 이 도메인 범위(자기 자신 또는 `*.rootDomain`)인지
   *    → 쿠키 공유 범위와 1st-party 정의를 정확히 일치시킨다(오픈 리다이렉트 방지).
   * 미설정(로컬)이면 쿠키는 host-only, 1st-party 는 인증서버 host 와 동일할 때로 폴백한다.
   */
  readonly rootDomain?: string;

  /**
   * 쿠키에 Secure 를 붙일지. HTTPS 로 서비스하면 켠다.
   * refresh-cookie.ts 가 같은 키를 ConfigSource 에서 직접 읽는다 — 값의 출처는 하나다.
   */
  readonly cookieSecure: boolean;

  /**
   * 소셜 로그인 흐름(state·흐름 쿠키)의 유효시간(초).
   *
   * **둘이 같은 값이어야 한다.** state 가 살아 있는데 쿠키가 죽으면 정상 로그인이 거부되고,
   * 반대면 쿠키가 의미 없이 남는다. 그래서 한 곳에서 읽어 양쪽에 넘긴다.
   *
   * provider 화면에서 사용자가 계정을 고르고 동의하는 시간이라 너무 짧으면 실패한다.
   */
  readonly socialFlowTtlSec: number;

  /** bcrypt 코스트(라운드). 기본 10 */
  readonly bcryptRounds: number;

  /**
   * 지금 유효한 약관·방침의 판(시행일). 가입 요청이 보낸 판과 이 값이 다르면 거절한다.
   *
   * **왜 대조하나.** 배포 직후에는 브라우저가 옛 번들을 들고 있을 수 있다. 그 화면에 뜬 것은
   * 옛 조문인데 서버가 새 판에 동의한 것으로 기록하면, 기록과 실제로 읽은 글이 어긋난다.
   * 그럴 바에는 거절하고 새로고침을 시키는 편이 낫다.
   *
   * **값은 문서의 시행일과 같아야 한다** — frontend/legal 의 각 JSON `version` 필드.
   * 약관을 개정하면 그 파일과 이 기본값(또는 config 의 auth.consent.*)을 함께 고친다.
   */
  readonly consentVersions: ConsentVersions;
}

/*
  **소셜 자격증명은 여기 없다.** 값이 DB(env_setting)에 있고, 요청마다 SocialStrategyFactory 가
  읽어 전략을 만든다 — 부팅 때 확정하면 화면에서 키를 바꿔도 재시작 전까지 안 먹는다.
  "설정된 provider 인가" 판정도 그쪽으로 옮겼다(없으면 404, 응답은 예전과 같다).
*/

/**
 * EnvSource 에서 인증 설정을 뽑아 검증한다.
 * JWT_SECRET 이 없으면 부팅 시점에 즉시 실패한다.
 */
export function buildAuthConfig(source: ConfigSource): AuthConfig {
  // 비밀·비밀아님 모두 계산된 트리에서 경로로 읽는다. 비밀 아닌 값은 config/config.yaml 또는
  // 환경변수(AUTH_ISSUER→authIssuer), 시크릿은 .env(AUTH_JWT_SECRET→authJwtSecret)에서 공급된다.
  const issuer = source.getStringOrDefault('auth.jwt.issuer') || undefined;
  // 허용 발급처 = auth.jwt.allowedIssuers(yaml 리스트) + 자기 issuer(자동 포함).
  const allowedIssuers = [...source.getStringArray('auth.jwt.allowedIssuers')];
  if (issuer && !allowedIssuers.includes(issuer)) {
    allowedIssuers.push(issuer);
  }
  // authorization_endpoint = 인증웹(fe/hans-auth) 로그인 URL(예: https://auth.plzhans.com/login).
  // 로그인 UI 가 별도 서브도메인(hans-auth)으로 분리돼 있어 명시 설정한다(자동 파생 없음).
  // 뒤에 경로를 붙여 쓰므로 끝의 / 는 떼어 둔다.
  const externalUrl =
    source.getStringOrDefault('auth.externalUrl').replace(/\/+$/, '') || undefined;
  const authorizeUrl = externalUrl ? `${externalUrl}/login` : undefined;
  return Object.freeze({
    jwtSecret: source.getString('auth.jwt.secret'),
    jwtKeyDir: source.getStringOrDefault('auth.jwt.keyDir') || undefined,
    issuer,
    authorizeUrl,
    externalUrl,
    allowedIssuers: Object.freeze(allowedIssuers),
    // 만료는 기간 문자열(1h·7d·5m)로 선언되고 초로 변환된다.
    // **기본값은 여기가 원천이다** — yaml 에서는 주석으로 가려 두고, 환경마다 다르게
    // 가져갈 때만 그 줄을 살린다. 예전엔 필수였는데, 그러면 yaml 에 한 줄만 빠져도
    // 부팅이 죽었다(환경 yaml 은 서로 상속하지 않아 세 파일에 다 적어야 했다).
    accessTokenTtlSec: source.getDurationSecOrDefault('auth.jwt.accessTokenExpiresIn'),
    refreshTokenTtlSec: source.getDurationSecOrDefault('auth.jwt.refreshTokenExpiresIn'),
    authCodeTtlSec: source.getDurationSecOrDefault('auth.jwt.authCodeExpiresIn'),
    accessCache: Object.freeze({
      memoryTtlSec: source.getNumberOrDefault('cache.memoryTtlSec'),
      memoryMaxEntries: source.getNumberOrDefault('cache.memoryMaxEntries'),
      sharedTtlSec: source.getNumberOrDefault('cache.sharedTtlSec'),
    }),
    sessionCache: Object.freeze({
      memoryTtlSec: source.getNumberOrDefault('auth.sessionCache.memoryTtlSec'),
      sharedTtlSec: source.getNumberOrDefault('auth.sessionCache.sharedTtlSec'),
      // 상한은 접근 캐시와 같은 값을 쓴다. 성격이 같고 따로 조절할 이유가 없다.
      memoryMaxEntries: source.getNumberOrDefault('cache.memoryMaxEntries'),
    }),
    profileCache: Object.freeze({
      memoryTtlSec: source.getNumberOrDefault('auth.profileCache.memoryTtlSec'),
      sharedTtlSec: source.getNumberOrDefault('auth.profileCache.sharedTtlSec'),
      memoryMaxEntries: source.getNumberOrDefault('cache.memoryMaxEntries'),
    }),
    withdrawalRetentionDays: source.getNumberOrDefault('auth.withdrawalRetentionDays'),
    // 앞 점 제거·트림 후, IP·점없는 라벨(localhost 등)이면 경고 후 무시(빈값). 도메인만 통과.
    rootDomain: normalizeRootDomain(source.getStringOrDefault('auth.rootDomain')),
    cookieSecure: source.getBoolOrDefault('auth.cookieSecure'),
    socialFlowTtlSec: source.getNumberOrDefault('auth.socialFlowTtlSec'),
    bcryptRounds: source.getNumberOrDefault('auth.bcryptRounds'),
    maxSessionsPerUser: source.getNumberOrDefault('auth.maxSessionsPerUser'),
    consentVersions: Object.freeze({
      terms: source.getStringOrDefault('auth.consent.termsVersion'),
      privacy: source.getStringOrDefault('auth.consent.privacyVersion'),
    }),
  });
}
