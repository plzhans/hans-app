import {
  EnvSource,
  optionalNumber,
  optionalString,
  requireString,
} from '@hansapi/common';

/** 공공데이터포털 설정 주입 토큰 */
export const KRDATA_CONFIG = Symbol('KRDATA_CONFIG');

/** openapi 스펙에 박혀 있는 HIRA 상세 서비스 버전. */
const DEFAULT_HIRA_DETAIL_VERSION = '2.8';

/**
 * 공공데이터포털(data.go.kr) API 설정. 이 계층이 스스로 정의하고 스스로 검증한다.
 *
 * hansapi-server 는 이 설정을 모른다. 서버는 로컬 DB 만 읽고 외부 API 를 호출하지 않으므로
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
   */
  readonly hiraDetailVersion: string;
}

/**
 * EnvSource 에서 공공데이터 설정을 뽑아 검증한다.
 * 서비스키가 없으면 부팅 시점에 즉시 실패한다. sync 를 실행하는 순간이 아니라.
 */
export function buildKrDataConfig(source: EnvSource): KrDataAppConfig {
  return Object.freeze({
    serviceKey: requireString(source, 'KRDATA_SERVICE_KEY'),
    maxRetry: optionalNumber(source, 'KRDATA_MAX_RETRY', 3),
    readTimeoutMs: optionalNumber(source, 'KRDATA_READ_TIMEOUT_MS', 60_000),
    hiraDetailVersion:
      optionalString(source, 'KRDATA_HIRA_DETAIL_VERSION') ??
      DEFAULT_HIRA_DETAIL_VERSION,
  });
}
