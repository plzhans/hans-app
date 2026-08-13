import type { ConfigSource } from '@hansapp/common';

/** 관리자 인증 설정 주입 토큰 */
export const ADMIN_AUTH_CONFIG = Symbol('ADMIN_AUTH_CONFIG');

/**
 * access token 의 audience. **상수다** — 설정으로 열지 않는다.
 *
 * 서명 시크릿이 이미 갈려 있어 공개 API 토큰은 여기서 검증에 실패한다. 이 값은 그 위에
 * 한 겹 더 두는 것이다 — 언젠가 설정 실수로 두 시크릿이 같아지는 날을 위한 보험이라,
 * 설정에서 바꿀 수 있으면 보험이 되지 않는다.
 */
export const ADMIN_TOKEN_AUDIENCE = 'hansapp-admin';

export interface AdminAuthConfig {
  /** access token(JWT) 서명 키(HS256). **공개 API 의 auth.jwt.secret 과 달라야 한다.** */
  readonly jwtSecret: string;
  /**
   * 이 서버가 어느 환경인가(local·develop·production).
   *
   * **서명 키를 환경마다 갈라 놓는 데 쓴다.** 시크릿은 환경마다 다르게 두는 것이 규칙이지만,
   * 실수로 같은 값이 들어가는 일이 실제로 일어난다 — 그때 개발에서 발행한 토큰이
   * 운영에서 통하면 안 된다.
   */
  readonly appEnv: string;

  /** 발급자. 설정하면 sign 에 박고 verify 에서 대조한다. */
  readonly issuer?: string;
  readonly accessTokenTtlSec: number;
  readonly refreshTokenTtlSec: number;
  readonly bcryptRounds: number;
  /** 쿠키에 secure 를 붙일지. 공개 API 와 같은 값을 읽는다(출처를 하나로 둔다). */
  readonly cookieSecure: boolean;
  /** 관리자 한 명이 동시에 가질 수 있는 세션 수. 0 이하면 제한하지 않는다. */
  readonly maxSessionsPerAdmin: number;
  readonly bootstrap: AdminBootstrapConfig;
}

/**
 * 첫 관리자 계정 자동 생성 설정.
 *
 * 관리자 계정을 만드는 통로가 CLI 뿐이라, 새 환경을 세울 때마다 "서버는 떴는데 로그인할
 * 계정이 없는" 상태를 손으로 풀어야 했다. 이 설정을 켜면 부팅할 때 계정이 하나도 없는 경우에만
 * 기본 계정을 만든다.
 *
 * **local·develop 전용이다.** 운영에서는 설정과 무관하게 동작하지 않는다 —
 * 자세한 이유는 AdminBootstrapService 주석 참고.
 */
export interface AdminBootstrapConfig {
  readonly enabled: boolean;
  readonly email: string;
  /** 비우면 난수로 만들어 부팅 로그에 한 번 찍는다. */
  readonly password: string;
  readonly name: string;
}

/**
 * 관리자 인증 설정을 만든다.
 *
 * **만료 기본값의 원천은 여기(코드)다** — yaml 에는 시크릿과 환경마다 달라야 하는 값만 적는다.
 * 환경 yaml 은 서로 상속하지 않아서 필수로 두면 세 파일 중 하나만 빠져도 그 환경이 부팅에 실패한다.
 */
export function buildAdminAuthConfig(source: ConfigSource): AdminAuthConfig {
  const jwtSecret = source.getString('admin.jwt.secret');

  /*
    **공개 API 와 같은 시크릿이면 부팅을 거부한다.**

    같은 값이면 hansapp-api 가 발급한 access token 이 서명 검증을 통과한다. 그러면 일반
    회원 계정으로 로그인해 받은 토큰으로 관리자 API 를 부를 수 있고, 계정 테이블을 갈라 둔
    의미가 통째로 사라진다. 설정 파일 두 곳에 같은 환경변수를 적는 실수 하나로 벌어지는 일이라
    런타임에 알아채기를 기대할 수 없다 — 뜨지 않게 막는다.
  */
  if (jwtSecret === source.getStringOrDefault('auth.jwt.secret')) {
    throw new Error(
      'admin.jwt.secret must differ from auth.jwt.secret — ' +
        'sharing it would let public API tokens pass admin authentication.',
    );
  }

  return Object.freeze({
    jwtSecret,
    appEnv: source.env,
    issuer: source.getStringOrDefault('admin.jwt.issuer') || undefined,
    // 5분. 짧게 잡아 계정을 비활성화했을 때 최대 이만큼만 버티게 한다 —
    // access token 은 stateless 라 즉시 폐기가 안 된다.
    accessTokenTtlSec: source.getDurationSecOrDefault('admin.jwt.accessTokenExpiresIn'),
    // 8시간. 하루 근무를 덮으므로 작업 중 재로그인이 없고, 퇴근 뒤에는 자연히 끊긴다.
    refreshTokenTtlSec: source.getDurationSecOrDefault('admin.jwt.refreshTokenExpiresIn'),
    bcryptRounds: source.getNumberOrDefault('admin.bcryptRounds'),
    cookieSecure: source.getBoolOrDefault('auth.cookieSecure'),
    maxSessionsPerAdmin: source.getNumberOrDefault('admin.maxSessionsPerAdmin'),
    bootstrap: Object.freeze({
      // **기본은 꺼짐이다.** 켜는 것을 명시적으로 적게 한다 — 자동으로 계정이 생기는
      // 동작은 설정 파일만 보고도 알 수 있어야 한다.
      enabled: source.getBoolOrDefault('admin.bootstrap.enabled'),
      email: source.getStringOrDefault('admin.bootstrap.email'),
      password: source.getStringOrDefault('admin.bootstrap.password'),
      name: source.getStringOrDefault('admin.bootstrap.name'),
    }),
  });
}
