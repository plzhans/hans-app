import { SetMetadata } from '@nestjs/common';
import type { DomainEventName } from '@hansapp/event-contract';

/** 이 메서드가 처리할 이벤트 이름을 표시하는 메타데이터 키. */
export const DOMAIN_EVENT_HANDLER = Symbol('DOMAIN_EVENT_HANDLER');

/**
 * 도메인 이벤트 구독.
 *
 * **받는 쪽도 전달 수단을 모른다.** 큐에서 꺼내 오는 것도, 워커 동시성도, 재시도도 이
 * 데코레이터 뒤에 있다 — 처리 코드는 "이 이벤트가 오면 이걸 한다" 만 적는다.
 *
 * 이름은 문자열이 아니라 DomainEvent 상수만 받는다. 오타가 조용히 "아무도 안 받는 이벤트"가
 * 되는 것을 타입으로 막는다.
 */
export function OnDomainEvent(name: DomainEventName): MethodDecorator {
  return SetMetadata(DOMAIN_EVENT_HANDLER, name);
}
