import type { ConfigSource } from '@hansapp/common';

/** 공공데이터포털 설정 주입 토큰 */
export const KRDATA_CONFIG = Symbol('KRDATA_CONFIG');

/** openapi 스펙에 박혀 있는 HIRA 상세 서비스 버전. 설정이 비면 이 값을 쓴다. */
export const DEFAULT_HIRA_DETAIL_VERSION = '2.8';

/**
 * 공공데이터포털(data.go.kr) API 설정. 이 계층이 스스로 정의하고 스스로 검증한다.
 *
 * hansapp-api 는 이 설정을 모른다. 서버는 로컬 DB 만 읽고 외부 API 를 호출하지 않으므로
 * 서비스키가 없어도 떠야 한다. 그래서 통합 설정 객체를 만들지 않고 계층별로 나눈다.
 */
export interface KrDataAppConfig {
  /** 포털이 주는 "Encoding" 키를 그대로 쓴다. 재인코딩하면 401 이 난다. */
  readonly serviceKey: string;

  /** 5xx·네트워크 오류 시 최대 시도 횟수 */
  readonly maxRetry: number;

  /** 응답을 기다리는 최대 시간 (ms) */
  readonly readTimeoutMs: number;

  /**
   * HIRA 의료기관별상세정보서비스 버전. 기본 2.8.
   *
   * **키마다 승인된 버전이 다르다.** 포털은 버전이 오르면 기존 신청자에겐 옛 버전을 유지시키고
   * 새 활용신청은 새 버전으로만 승인한다. 그래서 서비스키를 바꾸면 버전도 같이 맞춰야 한다.
   * 2.7 만 승인된 키로 2.8 을 부르면 403 Forbidden 이다 — 키가 아니라 경로가 틀린 것이다.
   *
   * 서비스키와 짝이라 값도 같은 자리(DB env_setting)에 있다. serviceKey 와 마찬가지로
   * 모듈이 부팅할 때 비동기로 채운다.
   */
  readonly hiraDetailVersion: string;
}

/**
 * EnvSource 에서 공공데이터 설정을 뽑는다.
 *
 * **서비스키는 선택이다(없으면 빈 문자열).** admin 계층에도 외부 API 를 안 때리는 커맨드가 있어서다
 * — 예컨대 ES 색인은 우리 DB 를 읽어 ES 에 밀 뿐 data.go.kr 을 호출하지 않는다. 그런 커맨드까지
 * 키를 요구하면 못 돌린다. 그래서 서버(app.module)와 같은 방침을 쓴다 — 키 없이 떠도 되고, 키가
 * **정말 필요한 sync 는 호출 시점에** 401/403 으로 드러난다(부팅 때가 아니라).
 */
export function buildKrDataConfig(source: ConfigSource): KrDataAppConfig {
  /*
    **serviceKey·hiraDetailVersion 은 여기서 안 읽는다.** 값이 DB(env_setting)에 있어서
    모듈이 부팅할 때 비동기로 채운다(admin-application.module 의 KRDATA_CONFIG 프로바이더).
    자리만 잡아 두는 것이고, 실제 값이 그 자리를 덮는다.
  */
  return Object.freeze({
    serviceKey: '',
    maxRetry: source.getNumberOrDefault('krdata.maxRetry'),
    readTimeoutMs: source.getNumberOrDefault('krdata.readTimeoutMs'),
    hiraDetailVersion: DEFAULT_HIRA_DETAIL_VERSION,
  });
}
