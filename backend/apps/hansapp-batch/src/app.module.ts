import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule } from '@sentry/nestjs/setup';
import { AdminApplicationModule } from '@hansapp/admin-application';
import type { ConfigSource } from '@hansapp/common';

import { BATCH_CONFIG, buildBatchConfig } from './batch.config';
import { BatchScheduler } from './batch.scheduler';
import { BatchService } from './batch.service';

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
        AdminApplicationModule.forRoot(source),
      ],
      providers: [
        { provide: BATCH_CONFIG, useValue: buildBatchConfig(source) },
        BatchService,
        BatchScheduler,
      ],
    };
  }
}
