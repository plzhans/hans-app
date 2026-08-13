import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Worker, type Job } from 'bullmq';
import type { DomainEventName } from '@hansapp/event-contract';

import { DOMAIN_EVENT_HANDLER } from './on-domain-event.decorator';
import { EVENT_QUEUE_NAME } from './event-queue';

type Handler = (payload: unknown) => Promise<void> | void;

/**
 * 큐에서 이벤트를 꺼내 `@OnDomainEvent` 가 붙은 메서드로 넘긴다.
 *
 * **이 클래스를 등록한 프로세스가 워커가 된다.** API 에 등록하면 API 가, 배치에 등록하면
 * 배치가 처리한다 — 소비를 전용 서버로 옮기고 싶으면 그 서버에서 이 모듈만 등록하면 되고,
 * 발행하는 코드는 한 줄도 바뀌지 않는다.
 *
 * 처리기는 부팅 때 한 번 훑어 이름별로 모아 둔다. 잡 이름이 곧 이벤트 이름이라, 꺼낼 때
 * 이름으로 찾아 부른다.
 */
@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumer.name);
  private readonly handlers = new Map<string, Handler[]>();
  private worker?: Worker;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly redisUrl: string | undefined,
    private readonly concurrency: number,
  ) {}

  onModuleInit(): void {
    this.collectHandlers();

    if (!this.redisUrl) {
      // Redis 가 없는 환경에서도 프로세스는 떠야 한다. 소비만 쉰다.
      this.logger.warn('큐가 없어 이벤트를 소비하지 않는다');
      return;
    }
    if (this.handlers.size === 0) {
      // 처리기가 하나도 없는데 워커를 띄우면 잡을 꺼내 놓고 버리게 된다.
      this.logger.log('처리기가 없어 워커를 띄우지 않는다');
      return;
    }

    this.worker = new Worker(EVENT_QUEUE_NAME, (job: Job) => this.dispatch(job), {
      connection: { url: this.redisUrl },
      concurrency: this.concurrency,
    });
    this.logger.log(
      `이벤트 소비 시작 — ${[...this.handlers.keys()].join(', ')} (동시 ${this.concurrency})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    // 처리 중인 잡을 마치고 닫는다. 그냥 죽이면 그 잡이 stalled 로 남아 다시 돈다.
    await this.worker?.close();
  }

  /** 부팅 때 프로바이더를 훑어 `@OnDomainEvent` 메서드를 이름별로 모은다. */
  private collectHandlers(): void {
    for (const wrapper of this.discovery.getProviders()) {
      // DiscoveryService 는 instance 를 any 로 준다. 객체인지 먼저 좁혀서 쓴다.
      const instance: unknown = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      if (!prototype) continue;

      const target = instance as Record<string, unknown>;
      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const fn = target[method];
        if (typeof fn !== 'function') continue;

        const name = this.reflector.get<DomainEventName | undefined>(DOMAIN_EVENT_HANDLER, fn);
        if (!name) continue;

        const bound = (fn as Handler).bind(instance);
        this.handlers.set(name, [...(this.handlers.get(name) ?? []), bound]);
      }
    }
  }

  /**
   * 잡 하나를 처리기들에게 넘긴다.
   *
   * **처리기가 던지면 그대로 올린다.** BullMQ 가 그 잡을 실패로 보고 재시도한다 —
   * 여기서 삼키면 "성공했다" 로 기록되어 영영 다시 시도되지 않는다.
   */
  private async dispatch(job: Job): Promise<void> {
    const handlers = this.handlers.get(job.name);
    if (!handlers?.length) {
      // 이 프로세스가 모르는 이벤트다. 다른 소비자가 처리할 수도 있으니 조용히 넘긴다.
      return;
    }
    for (const handle of handlers) {
      await handle(job.data);
    }
  }
}
