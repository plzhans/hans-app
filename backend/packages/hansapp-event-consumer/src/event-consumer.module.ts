import { Module, type DynamicModule } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { ConfigSource } from '@hansapp/common';

import { EventConsumer } from './event-consumer.service';

/**
 * 이벤트 소비 모듈. **등록한 프로세스가 워커가 된다.**
 *
 * 처리기(@OnDomainEvent 가 붙은 프로바이더)는 이 모듈을 등록한 앱이 자기 providers 에 둔다 —
 * 이 패키지는 무엇을 처리하는지 모르고, 부팅 때 훑어서 찾을 뿐이다.
 */
@Module({})
export class EventConsumerModule {
  static forRoot(source: ConfigSource): DynamicModule {
    const redisUrl = source.getUrlOrDefault('redis.url') || undefined;
    // 동시 처리 수. 이벤트 처리는 대개 DB 한두 번이라 크게 잡을 이유가 없다.
    const concurrency = source.getNumberOrDefault('events.concurrency');

    return {
      module: EventConsumerModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: EventConsumer,
          useFactory: (
            discovery: DiscoveryService,
            scanner: MetadataScanner,
            reflector: Reflector,
          ) => new EventConsumer(discovery, scanner, reflector, redisUrl, concurrency),
          inject: [DiscoveryService, MetadataScanner, Reflector],
        },
      ],
      exports: [EventConsumer],
    };
  }
}
