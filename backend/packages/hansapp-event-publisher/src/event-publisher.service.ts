import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { DomainEventName, DomainEventPayloads } from '@hansapp/event-contract';

/**
 * 도메인 이벤트 발행기.
 *
 * **쓰는 쪽은 무엇으로 전달되는지 모른다.** 지금은 Redis 큐(BullMQ)에 넣지만, 발행부는
 * `publish(이름, 내용)` 만 안다 — 소비자가 같은 프로세스에 있든 다른 서버에 있든 그대로다.
 *
 * **기다리지 않는다.** 로그인 응답처럼 사람이 기다리는 경로에서 부르기 때문에, 큐에 넣는
 * 것조차 await 하지 않는다. 후속 처리가 느리다고 응답이 늦어지면 안 된다.
 *
 * **큐가 없으면 조용히 버린다.** Redis 를 설정하지 않은 환경(로컬 일부)에서도 서버는 떠야
 * 하고, 로그인 같은 본업이 그것 때문에 실패해서는 안 된다. 대신 경고를 남긴다 —
 * 조용히 사라지는 것과 조용한 줄도 모르는 것은 다르다.
 */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(private readonly queue: Queue | null) {}

  publish<N extends DomainEventName>(name: N, payload: DomainEventPayloads[N]): void {
    if (!this.queue) {
      this.logger.warn(`큐가 없어 이벤트를 버린다 — ${name}`);
      return;
    }
    void this.queue.add(name, payload).catch((error: unknown) => {
      // 발행 실패가 본업(로그인·가입)을 무너뜨리면 안 된다. 남기고 넘어간다.
      this.logger.error(`이벤트 발행 실패 — ${name}`, error);
    });
  }
}
