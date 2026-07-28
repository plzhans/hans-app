import { Inject, Injectable, Logger } from '@nestjs/common';
import { RunAllResult, SyncRunnerService } from '@hansapp/admin-application';

import { BATCH_CONFIG, BatchConfig } from './batch.config';

/**
 * 하루치 배치. NMC 와 HIRA 를 각각 1단계부터 끝까지 순서대로 돌린다.
 *
 * 크론은 하나뿐이다. "목록은 주 1회, 상세는 매일" 이라는 요구는 크론을 나누지 않고
 * **단계별 신선도**로 푼다. 1단계는 신선도가 7일이라 주 6일은 스스로 생략된다.
 * (생략은 실패가 아니다. 다음 단계로 그대로 진행한다)
 *
 * NMC 와 HIRA 는 서로 다른 API 서버라 콜 한도가 별개다. 그래서 예산도 따로 잡고,
 * 한쪽이 실패해도 다른 쪽은 계속 돈다. 두 기관의 데이터는 독립이다.
 */
@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  /** 겹쳐 도는 것을 막는다. 단계 단위 잠금(sync_state)과 별개로 프로세스 안에서도 막는다. */
  private running = false;

  constructor(
    private readonly runner: SyncRunnerService,
    @Inject(BATCH_CONFIG) private readonly config: BatchConfig,
  ) {}

  async runDaily(force = false): Promise<void> {
    if (this.running) {
      this.logger.warn('이전 실행이 아직 안 끝났다. 이번 회차는 건너뛴다.');
      return;
    }

    this.running = true;
    const startedAt = Date.now();

    try {
      this.logger.log('배치 시작');

      // 일일 한도는 원본이 알려준다(resultCode 22). 우리가 세지 않는다.
      // budget 은 사고 방지용 안전판일 뿐이고 보통은 없다.
      const budget = this.config.maxCallsPerRun;

      const nmc = await this.runner.runAll('nmc', { budget, force });
      this.report('NMC', nmc);

      // HIRA 는 NMC 와 독립이다. 서비스키도 한도도 별개라 NMC 가 멈춰도 여기는 돈다.
      const hira = await this.runner.runAll('hira', { budget, force });
      this.report('HIRA', hira);

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.logger.log(
        `배치 완료 — 총 ${(nmc.calls + hira.calls).toLocaleString()}콜 / ${seconds}초`,
      );
    } finally {
      this.running = false;
    }
  }

  /** 단계별 결과를 한 줄씩 남긴다. 실패한 단계가 있으면 마지막 줄이 그것이다. */
  private report(label: string, result: RunAllResult): void {
    for (const run of result.runs) {
      if (run.error) {
        this.logger.error(`  ${label} ${run.stage}단계 실패 — ${run.error}`);
      } else if (run.result?.skipped) {
        this.logger.log(
          `  ${label} ${run.stage}단계 생략 — ${run.result.skipReason}`,
        );
      } else {
        this.logger.log(
          `  ${label} ${run.stage}단계 — 콜 ${run.result?.calls.toLocaleString()} / 처리 ${run.result?.processed.toLocaleString()}`,
        );
      }
    }

    if (result.budgetExhausted) {
      this.logger.log(
        `  ${label} 콜 예산 소진. 남은 단계는 다음 실행에서 이어받는다.`,
      );
    }
  }
}
