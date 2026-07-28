import { KrDataError } from '@krdata/core';

/**
 * 에러를 사람이 읽을 메시지로 만든다.
 *
 * 공공데이터 API 에러는 결과코드가 있어야 원인을 알 수 있다(401=서비스키, 30=미등록 등).
 * 그 코드가 SDK 의 KrDataError 에 실려 오는데, 이걸 아는 것은 외부 API 를 다루는 이 계층의 몫이다.
 * CLI 는 SDK 를 알지 못한 채 메시지만 출력한다.
 */
export function describeError(error: unknown): string {
  if (error instanceof KrDataError) {
    return `[${error.errorCode}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
