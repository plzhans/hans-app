import { Inject, Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as Sentry from '@sentry/nestjs';

import { BATCH_CONFIG, BatchConfig } from './batch.config';
import { BatchService } from './batch.service';

/**
 * 이 크론 잡의 이름. SchedulerRegistry 등록명과 Sentry 태그가 **같은 상수를 본다** —
 * 두 군데에 문자열을 따로 박으면 한쪽만 바뀌어 조용히 어긋난다.
 *
 * 소스 이름(krdata·nmc·hira)을 넣지 않는다. 이 크론은 특정 기관을 도는 게 아니라
 * **하루치 배치 전체**(BatchService.runDaily → NMC·HIRA 전 단계)를 돌린다.
 * 소스가 늘어도 이름은 그대로 맞다.
 */
const CRON_JOB_NAME = 'daily-sync';

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
        // 로그만 남기면 아무도 안 본다. 크론이 통째로 실패한 것이므로 Sentry 로 올린다.
        // (상주 모드라 프로세스가 살아 있으니 flush 는 필요 없다.)
        Sentry.captureException(error, { tags: { job: CRON_JOB_NAME } });
      });
    });

    this.registry.addCronJob(CRON_JOB_NAME, job);
    job.start();

    this.logger.log(`크론 등록 — ${this.config.cron}`);
  }
}
