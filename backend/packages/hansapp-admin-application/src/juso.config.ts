import type { ConfigSource } from '@hansapp/common';

/** 도로명주소(juso.go.kr) 설정 주입 토큰 */
export const JUSO_CONFIG = Symbol('JUSO_CONFIG');

/**
 * 도로명주소 개발자센터(business.juso.go.kr) API 설정. 이 계층이 스스로 정의하고 검증한다.
 *
 * data.go.kr(@krdata) 과 다른 소스라 KrDataAppConfig 와 섞지 않는다. 인증키 이름도
 * ServiceKey 가 아니라 confmKey(승인키)이고, 검색 API 승인키가 아니면 E0001 로 거부된다.
 *
 * hansapp-api-server(게이트웨이)는 이 설정을 모른다 — 외부 API 호출은 이 계층만 한다.
 *
 * **승인키는 선택이다(없으면 빈 문자열).** admin 계층에도 외부 API 를 안 쓰는 커맨드(ES 색인 등)가
 * 있어 키 없이도 떠야 한다 — 서버와 같은 방침이다. 키가 정말 필요한 sync 는 호출 시점에 E0001 로
 * 드러난다(부팅 때가 아니라).
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
export function buildJusoConfig(source: ConfigSource): JusoAppConfig {
  // confmKey 만 시크릿(.env). 재시도·타임아웃은 비밀 아님 → getX.
  return Object.freeze({
    confmKey: source.getStringOrDefault('juso.serviceKey'),
    maxRetry: source.getNumberOrDefault('juso.maxRetry', 3),
    readTimeoutMs: source.getNumberOrDefault('juso.readTimeoutMs', 30_000),
  });
}
