import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ConfigSource } from '@hansapp/common';
import { Queue } from 'bullmq';

import { EVENT_QUEUE_NAME, readRedisUrl } from './event-queue';
import { EventPublisher } from './event-publisher.service';

/** 큐 인스턴스 주입 토큰. 패키지 밖으로 내보내지 않는다 — 밖에서 큐를 직접 만질 일이 없다. */
const EVENT_QUEUE = Symbol('EVENT_QUEUE');

/**
 * 이벤트 발행 모듈.
 *
 * **전역이다.** 발행은 어느 계층에서나 일어날 수 있는데, 그때마다 imports 에 적게 하면
 * "이벤트를 하나 더 내려고 모듈을 고치는" 일이 생긴다.
 *
 * **소비자를 모른다.** 이 모듈은 큐에 넣기만 한다. 누가 꺼내 처리하는지는 @hansapp/event-consumer
 * 를 등록한 프로세스의 몫이고, 그 프로세스가 없어도 발행은 성공한다(큐에 쌓일 뿐이다).
 */
@Global()
@Module({})
export class EventPublisherModule {
  static forRoot(source: ConfigSource): DynamicModule {
    const url = readRedisUrl(source);
    return {
      module: EventPublisherModule,
      providers: [
        {
          provide: EVENT_QUEUE,
          useValue: url
            ? new Queue(EVENT_QUEUE_NAME, { connection: { url } })
            : null,
        },
        {
          provide: EventPublisher,
          useFactory: (queue: Queue | null) => new EventPublisher(queue),
          inject: [EVENT_QUEUE],
        },
      ],
      exports: [EventPublisher],
    };
  }
}
