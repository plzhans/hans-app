import { Controller, Get, Inject } from '@nestjs/common';
import { BatchJobService } from '@hansapp/admin-application';
import { BatchCategory } from '@hansapp/common';

import { BATCH_CONFIG, BatchConfig } from '../batch.config';
import { BATCH_JOBS } from '../batch.jobs';
import { buildInfo } from '../boot-config';
import { RUNNER } from '../runner';

/**
 * 배치가 살아 있는지 확인하는 창구.
 *
 * **포트를 여는 것 자체가 목적의 절반이다.** 상주 모드는 이 포트를 잡고 시작하므로,
 * 같은 컴퓨터에 두 번째 배치를 띄우면 EADDRINUSE 로 즉시 죽는다 — Node 에 flock 이
 * 없어서 "죽으면 커널이 회수한다" 는 성질을 포트에서 빌려온 것이다.
 *
 * 나머지 절반은 모니터링이다. 지금은 살아 있는지와 무엇을 물고 있는지만 답하고,
 * 잡 현황·수동 실행 같은 것은 필요해질 때 여기 붙이면 된다.
 *
 * **인증을 걸지 않는다.** 컨테이너 헬스체크가 부르는 자리이고, 기본 바인드가
 * 127.0.0.1 이라 밖에서 닿지 않는다(컨테이너에서는 0.0.0.0 으로 열되 포트를 노출하지 않는다).
 */
@Controller()
export class BatchHealthController {
  constructor(
    private readonly jobs: BatchJobService,
    @Inject(BATCH_CONFIG) private readonly config: BatchConfig,
  ) {}

  /**
   * 살아 있나. **가볍게 유지한다** — DB 나 Redis 를 두드리지 않는다.
   *
   * 인프라 점검을 여기 넣으면 DB 가 잠깐 흔들릴 때 헬스체크가 실패하고, 오케스트레이터가
   * 멀쩡히 일하던 배치를 재시작시킨다. 적재 도중에 그러면 이어받기가 밀린다.
   */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** 어느 산출물이 돌고 있나. "옛 빌드가 떠 있나" 를 여기서 바로 본다. */
  @Get('version')
  version() {
    return {
      version: buildInfo.version,
      sha: buildInfo.sha,
      branch: buildInfo.branch,
      hostname: RUNNER.hostname,
      pid: RUNNER.pid,
    };
  }

  /**
   * 이 프로세스가 무슨 잡을 어떤 주기로 물고 있나.
   *
   * **DB 가 아니라 이 프로세스가 실제로 등록한 것**을 답한다. 콘솔(batch_job)은 마지막으로
   * 부팅한 프로세스가 써 둔 값이라, 옛 빌드가 딴 데서 돌고 있으면 둘이 어긋난다 —
   * 그 어긋남을 보라고 있는 엔드포인트다.
   */
  @Get('jobs')
  async jobs_() {
    return {
      hostname: RUNNER.hostname,
      pid: RUNNER.pid,
      version: buildInfo.version,
      timeZone: this.config.timeZone,
      jobs: await Promise.all(
        BATCH_JOBS.map(async (job) => ({
          job: job.name,
          // 숫자 코드는 DB 에 담는 모양이다. 밖으로는 이름으로 낸다(batch-codes.ts 규칙).
          category: BatchCategory[job.category],
          cron: this.config.crons[job.name],
          // 관리자가 콘솔에서 끈 잡은 크론 시각이 와도 돌지 않는다.
          enabled: await this.jobs.isEnabled(job.name),
        })),
      ),
    };
  }
}
