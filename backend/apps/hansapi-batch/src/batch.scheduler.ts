import { Inject, Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { BATCH_CONFIG, BatchConfig } from './batch.config';
import { BatchService } from './batch.service';

/**
 * 크론 등록.
 *
 * @Cron 데코레이터는 식을 컴파일 타임에 박아야 해서 설정으로 바꿀 수 없다.
 * 크론식을 env 로 조정하려면 SchedulerRegistry 에 직접 등록해야 한다.
 */
@Injectable()
export class BatchScheduler {
  private readonly logger = new Logger(BatchScheduler.name);

  constructor(
    private readonly batch: BatchService,
    private readonly registry: SchedulerRegistry,
    @Inject(BATCH_CONFIG) private readonly config: BatchConfig,
  ) {}

  register(): void {
    const job = new CronJob(this.config.cron, () => {
      void this.batch.runDaily().catch((error: unknown) => {
        // 여기까지 올라온 예외는 배치 자체의 버그다. 단계 실패는 이미 안에서 처리된다.
        this.logger.error('배치 실행 중 처리되지 않은 오류', error);
      });
    });

    this.registry.addCronJob('krdata-sync', job);
    job.start();

    this.logger.log(`크론 등록 — ${this.config.cron}`);
  }
}
