import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { EventPublisher } from './event-publisher.service';

/**
 * 이벤트 발행 모듈.
 *
 * **전역이다.** 발행은 어느 계층에서나 일어날 수 있는데, 그때마다 이 모듈을 imports 에
 * 적게 하면 "이벤트를 하나 더 내려고 모듈을 고치는" 일이 생긴다. 상태가 없고 의존도 없어
 * 전역으로 두는 비용이 없다.
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class EventPublisherModule {}
