import { OnEvent } from '@nestjs/event-emitter';

import type { DomainEventName } from './events';

/**
 * 도메인 이벤트 구독.
 *
 * `@OnEvent` 를 그대로 쓰지 않는 이유는 발행부와 같다 — **받는 쪽도 전달 수단을 몰라야**
 * 나중에 큐로 옮길 때 리스너를 안 고친다. 이름도 문자열이 아니라 DomainEvent 상수만 받는다.
 */
export function OnDomainEvent(name: DomainEventName): MethodDecorator {
  return OnEvent(name);
}
