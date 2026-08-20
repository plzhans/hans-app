import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { AdminApplicationModule } from '@hansapp/admin-application';
import { DataModule } from '@hansapp/data';
import { EventPublisherModule } from '@hansapp/event-publisher';
import { LockModule } from '@hansapp/lock';
import { SearchModule } from '@hansapp/search';
import type { ConfigSource } from '@hansapp/common';

import { BATCH_CONFIG, buildBatchConfig } from './batch.config';
import { BatchScheduler } from './batch.scheduler';
import { BatchHealthController } from './web/health.controller';
import { BatchService } from './batch.service';
import { AuthCleanupService } from './auth-cleanup.service';
import { SessionCacheSweeper } from './session-cache-sweeper.service';

/**
 * 배치의 루트 모듈.
 *
 * 실제 적재 로직은 하나도 여기 없다. admin-application 계층의 서비스를 호출하기만 한다.
 * CLI 와 완전히 같은 코드를 부른다 — CLI 는 사람이, 배치는 크론이 부르는 차이뿐이다.
 */
@Module({})
export class AppModule {
  static forRoot(source: ConfigSource): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Sentry 를 Nest 계층에 연결한다. Sentry.init 은 instrument.ts 가 이미 끝냈고,
        // 이 모듈은 Nest 쪽 배선만 한다(DSN 이 없어 init 을 건너뛰었어도 안전 — 전부 no-op).
        SentryModule.forRoot(),
        ScheduleModule.forRoot(),
        /*
          도메인 이벤트 발행(전역). **AdminApplicationModule 보다 먼저 둔다.**

          그 모듈 안의 서비스(UserProfileCacheAdmin 등)가 EventPublisher 를 주입받는데,
          이 모듈은 @Global 이라 **앱 루트가 한 번 등록해 주는 것**을 전제로 한다.
          빠뜨리면 부팅이 DI 에서 죽는다 — api·admin 은 등록하고 여기만 빠져 있었다.
        */
        EventPublisherModule.forRoot(source),
        /*
          잡 이름 기준 분산 락. **겹침 방지의 유일한 근거다** — 프로세스 안팎을 모두 덮는다.
          Redis 를 못 잡으면 잡은 아예 돌지 않는다(단일 실행 보장이 목적이라 그렇다).
        */
        LockModule.forRoot(source),
        AdminApplicationModule.forRoot(source),
        /*
          검색 색인(es-index 잡). AdminApplicationModule 도 SearchModule 을 쓰지만 그 안에서만
          보이므로(export 하지 않는다) 여기서 따로 받는다 — DataModule 과 같은 사정이다.
        */
        SearchModule.forRoot(source),
        // 인증 정리 잡이 Prisma 를 직접 쓴다. AdminApplicationModule 도 DataModule 을 쓰지만
        // 그 모듈 안에서만 보이므로(export 하지 않는다) 여기서 따로 받는다.
        DataModule.forRoot(source),
      ],
      controllers: [BatchHealthController],
      providers: [
        { provide: BATCH_CONFIG, useValue: buildBatchConfig(source) },
        BatchService,
        AuthCleanupService,
        SessionCacheSweeper,
        BatchScheduler,
      ],
    };
  }
}
