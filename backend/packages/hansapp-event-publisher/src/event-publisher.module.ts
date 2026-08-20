import { Global, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigSource } from '@hansapp/common';
import { Queue } from 'bullmq';

import { EVENT_QUEUE_NAME, readRedisUrl } from './event-queue';
import { EventPublisher } from './event-publisher.service';

/** 큐 인스턴스 주입 토큰. 패키지 밖으로 내보내지 않는다 — 밖에서 큐를 직접 만질 일이 없다. */
const EVENT_QUEUE = Symbol('EVENT_QUEUE');

/**
 * 큐를 들고 있다가 앱이 내려갈 때 연결을 닫는다.
 *
 * **끝나는 프로세스 때문에 있다.** 서버는 죽을 때까지 안 끝나서 안 닫아도 티가 안 나지만,
 * CLI 와 배치 `--once` 는 할 일을 마치고 나가야 한다 — 열린 Redis 연결이 이벤트 루프를
 * 붙잡고 있으면 커맨드가 끝나고도 프롬프트가 안 돌아온다.
 *
 * **큐를 그냥 useValue 로 두지 않고 이 껍데기를 씌운 이유가 그것이다.** 생명주기 훅은
 * 인스턴스에 붙는데, 이 패키지는 experimentalDecorators 를 켜지 않아 모듈 클래스에
 * 생성자 주입(@Inject)을 쓸 수 없다.
 */
class EventQueueHandle implements OnModuleDestroy {
  constructor(readonly queue: Queue | null) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}

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
          useValue: new EventQueueHandle(
            url ? new Queue(EVENT_QUEUE_NAME, { connection: { url } }) : null,
          ),
        },
        {
          provide: EventPublisher,
          useFactory: (handle: EventQueueHandle) => new EventPublisher(handle.queue),
          inject: [EVENT_QUEUE],
        },
      ],
      exports: [EventPublisher],
    };
  }
}
