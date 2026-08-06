import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DomainEventName, DomainEventPayloads } from './events';

/**
 * 도메인 이벤트 발행기.
 *
 * **쓰는 쪽은 무엇으로 전달되는지 모른다.** 지금은 같은 프로세스 안에서 리스너를 부르지만,
 * 나중에 큐(BullMQ 등)로 바뀌어도 발행부는 그대로다 — 그것이 이 계층을 따로 둔 이유다.
 *
 * **기다리지 않는다.** `publish` 는 값을 돌려주지 않고 리스너의 완료도 기다리지 않는다.
 * 로그인 응답 같은 사람이 기다리는 경로에서 부르기 때문이다 — 후속 처리가 느리다고 응답이
 * 늦어지면 안 된다. 리스너가 던진 오류도 여기서 삼킨다(리스너가 자기 오류를 로그로 남긴다).
 *
 * **그래서 전달이 보장되지 않는다.** 프로세스가 죽으면 처리되지 않은 이벤트는 사라진다.
 * 잃으면 안 되는 일(결제 등)에는 이대로 쓰면 안 되고, 같은 트랜잭션에 이벤트를 적어 두는
 * 아웃박스가 필요하다. 지금 담는 것은 "나중에 해도 되고, 놓쳐도 다음에 만회되는" 일뿐이다.
 */
@Injectable()
export class EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish<N extends DomainEventName>(
    name: N,
    payload: DomainEventPayloads[N],
  ): void {
    /*
      emit 은 리스너를 **같은 틱에서** 부른다. 리스너가 async 면 첫 await 지점까지만 동기로
      돌고 나머지는 뒤로 넘어가므로, 리스너 쪽에서 곧바로 await 하는 것으로 응답 경로를 비운다.
      (emitAsync 는 반대로 끝까지 기다린다 — 여기서는 쓰지 않는다.)
    */
    this.emitter.emit(name, payload);
  }
}
