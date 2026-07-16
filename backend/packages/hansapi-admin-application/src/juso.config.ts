import { EnvSource, optionalNumber, requireString } from '@hansapi/common';

/** 도로명주소(juso.go.kr) 설정 주입 토큰 */
export const JUSO_CONFIG = Symbol('JUSO_CONFIG');

/**
 * 도로명주소 개발자센터(business.juso.go.kr) API 설정. 이 계층이 스스로 정의하고 검증한다.
 *
 * data.go.kr(@krdata) 과 다른 소스라 KrDataAppConfig 와 섞지 않는다. 인증키 이름도
 * ServiceKey 가 아니라 confmKey(승인키)이고, 검색 API 승인키가 아니면 E0001 로 거부된다.
 *
 * hansapi-server(게이트웨이)는 이 설정을 모른다 — 외부 API 호출은 이 계층만 한다.
 * 승인키가 없으면 sync 실행 순간이 아니라 **부팅 시점에** 즉시 실패한다.
 */
export interface JusoAppConfig {
  /** 도로명주소 개발자센터에서 발급받은 검색 API 승인키(confmKey). */
  readonly confmKey: string;

  /** 5xx·네트워크 오류 시 최대 시도 횟수 */
  readonly maxRetry: number;

  /** 응답을 기다리는 최대 시간 (ms) */
  readonly readTimeoutMs: number;
}

/**
 * EnvSource 에서 도로명주소 설정을 뽑아 검증한다.
 * 승인키는 develop.env 등에 KRGO_JUSO_SERVICE_KEY 로 넣는다.
 */
export function buildJusoConfig(source: EnvSource): JusoAppConfig {
  return Object.freeze({
    confmKey: requireString(source, 'KRGO_JUSO_SERVICE_KEY'),
    maxRetry: optionalNumber(source, 'KRGO_JUSO_MAX_RETRY', 3),
    readTimeoutMs: optionalNumber(source, 'KRGO_JUSO_READ_TIMEOUT_MS', 30_000),
  });
}
