import { Inject, Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as Sentry from '@sentry/nestjs';

import { BATCH_CONFIG, BatchConfig } from './batch.config';
import { BatchService } from './batch.service';
import { AuthCleanupService } from './auth-cleanup.service';

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
 * 인증 부산물 정리 잡의 이름.
 *
 * **이름에 시간을 넣지 않는다.** 크론식은 설정으로 바뀌는 값이라, `nightly-…` 같은 이름은
 * 주기를 한 번만 바꿔도 거짓이 된다. 이름은 **무엇을 하는지**만 말한다.
 *
 * `session-` 이 아니라 `auth-` 인 이유는 세션 말고도 인가코드·이메일 인증 코드를 함께
 * 쓸기 때문이다(AuthCleanupService 참고).
 */
const AUTH_CLEANUP_JOB_NAME = 'auth-cleanup';

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
    private readonly authCleanup: AuthCleanupService,
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

    this.logger.log(`크론 등록 — ${CRON_JOB_NAME} ${this.config.cron}`);

    /*
      **적재와 별개 잡이다.** 공공데이터 적재는 외부 API 한도를 나눠 쓰며 단계가 이어지는
      파이프라인이고, 세션 정리는 우리 DB 만 만지는 독립적인 일이다. 한 잡에 묶으면
      적재가 길어지거나 실패할 때 정리까지 밀린다.
    */
    const cleanupJob = new CronJob(this.config.authCleanupCron, () => {
      void this.authCleanup.run().catch((error: unknown) => {
        // 테이블별 실패는 서비스가 이미 삼킨다. 여기까지 오면 잡 자체의 버그다.
        this.logger.error('인증 정리 중 처리되지 않은 오류', error);
        Sentry.captureException(error, {
          tags: { job: AUTH_CLEANUP_JOB_NAME },
        });
      });
    });

    this.registry.addCronJob(AUTH_CLEANUP_JOB_NAME, cleanupJob);
    cleanupJob.start();

    this.logger.log(`크론 등록 — ${AUTH_CLEANUP_JOB_NAME} ${this.config.authCleanupCron}`);
  }
}
