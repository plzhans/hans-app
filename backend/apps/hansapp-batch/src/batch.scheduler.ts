import { Inject, Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as Sentry from '@sentry/nestjs';
import { BatchJobService, stageCatalog, SyncStateService } from '@hansapp/admin-application';
import { BatchRunSource } from '@hansapp/common';

import { BATCH_CONFIG, BatchConfig } from './batch.config';
import { BatchService } from './batch.service';
import { BATCH_JOBS, type BatchJobDefinition } from './batch.jobs';

/**
 * 크론 등록.
 *
 * **잡마다 크론이 하나씩이다.** 잡 정의(BATCH_JOBS)를 훑어 그대로 등록하므로, 잡을 추가할 때
 * 이 파일은 손대지 않는다 — 정의에 한 줄 넣으면 등록·마스터 upsert·Sentry 감시가 따라온다.
 *
 * @Cron 데코레이터는 식을 컴파일 타임에 박아야 해서 설정으로 바꿀 수 없다.
 * 크론식을 설정으로 조정하려면 SchedulerRegistry 에 직접 등록해야 한다.
 * (그래서 Sentry 도 @SentryCron 데코레이터가 아니라 withMonitor 를 쓴다)
 */
@Injectable()
export class BatchScheduler {
  private readonly logger = new Logger(BatchScheduler.name);

  constructor(
    private readonly batch: BatchService,
    private readonly jobs: BatchJobService,
    private readonly stages: SyncStateService,
    private readonly registry: SchedulerRegistry,
    @Inject(BATCH_CONFIG) private readonly config: BatchConfig,
  ) {}

  async register(): Promise<void> {
    for (const definition of BATCH_JOBS) {
      await this.add(definition);
    }

    /*
      **단계도 등록한다.** 잡보다 한 칸 아래의 손잡이다 — 관리자가 단계를 끄려면 sync_state
      행이 먼저 있어야 하는데, 그 행은 원래 첫 실행 때 생긴다. 그러면 "아직 한 번도 안 돈
      단계를 미리 꺼 두는" 것이 안 되는데, 한도 때문에 끄려는 상황이 정확히 그 경우다.
      설명만 덮어쓰고 enabled 는 손대지 않는다.
    */
    await this.stages.register(stageCatalog());

    /*
      **없어진 잡을 마스터에서 치운다.** 잡 이름을 바꾸거나 지우면 옛 행이 남는데,
      그 행의 next_run_at 은 과거에 멈춰 있어 콘솔에 "예정 시각이 지났는데 안 돌았다" 로
      영원히 뜬다 — 거짓 경보가 섞이면 진짜 경보를 안 믿게 된다.
      이력은 로그 DB 에 그대로 남는다.
    */
    const pruned = await this.jobs.pruneExcept(BATCH_JOBS.map((job) => job.name));
    if (pruned.length > 0) {
      this.logger.log(`Removed jobs no longer registered: ${pruned.join(', ')}`);
    }
  }

  /**
   * 크론 하나를 등록하고 마스터(batch_job)에 올린다.
   *
   * **Sentry 감시를 여기서 함께 건다.** 표는 "무엇을 했나" 를 답하지만 "안 돌았다" 는
   * 못 답한다 — 행이 없는 것과 프로세스가 죽은 것이 같아 보이기 때문이다. 그건 감시가 맡는다.
   * 크론식이 설정값이라 감시 설정도 코드에서 실어 보낸다 — 주기를 바꾸면 저쪽 기대도 따라온다.
   */
  private async add(definition: BatchJobDefinition): Promise<void> {
    const cronExpression = this.config.crons[definition.name];

    /*
      이번 tick 이 원래 돌기로 했던 시각.

      **직전에 계산해 둔 값을 그대로 쓴다.** job.lastDate() 는 "실제로 불린 시각" 이라
      startedAt 과 사실상 같은 값이고, 그걸 예정 시각으로 삼으면 지연이 항상 0 으로 나온다.
      우리가 예정으로 삼았던 값(= 마스터의 next_run_at)과 비교해야 밀린 것이 보인다.
    */
    let expectedAt: Date | undefined;

    const job = new CronJob(
      cronExpression,
      () => {
        const scheduledAt = expectedAt;
        // 이 회차가 끝난 뒤의 다음 예정 시각. 마스터의 next_run_at 이 되고,
        // 다음 tick 에서는 그때의 예정 시각이 된다.
        const nextRunAt = job.nextDate().toJSDate();
        expectedAt = nextRunAt;

        void Sentry.withMonitor(
          definition.name,
          () =>
            this.batch.run(definition, {
              source: BatchRunSource.CRON,
              scheduledAt,
              nextRunAt,
            }),
          {
            schedule: { type: 'crontab', value: cronExpression },
            timezone: this.config.timeZone,
          },
        ).catch((error: unknown) => {
          // 여기까지 올라온 예외는 잡 자체의 버그다. 단계·테이블 실패는 이미 안에서 처리된다.
          this.logger.error(`Unhandled error in ${definition.name}`, error);
          // 로그만 남기면 아무도 안 본다. (상주 모드라 프로세스가 살아 있으니 flush 는 필요 없다)
          Sentry.captureException(error, { tags: { job: definition.name } });
        });
      },
      // onComplete 는 안 쓴다.
      null,
      false,
      this.config.timeZone,
    );

    this.registry.addCronJob(definition.name, job);
    job.start();

    const nextRunAt = job.nextDate().toJSDate();
    expectedAt = nextRunAt;

    await this.jobs.register({
      job: definition.name,
      description: definition.description,
      category: definition.category,
      cronExpression,
      timeZone: this.config.timeZone,
      nextRunAt,
    });

    this.logger.log(
      `Cron registered: ${definition.name} ${cronExpression} (${this.config.timeZone})` +
        ` — next ${nextRunAt.toISOString()}`,
    );
  }
}
