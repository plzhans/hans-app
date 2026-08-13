import { Inject, Injectable, Logger } from '@nestjs/common';
import { RunAllResult, SyncRunnerService } from '@hansapp/admin-application';

import { BATCH_CONFIG, BatchConfig } from './batch.config';

/**
 * 하루치 배치. 기관별로 1단계부터 끝까지 순서대로 돌린다.
 *
 * 크론은 하나뿐이다. "목록은 주 1회, 상세는 매일" 이라는 요구는 크론을 나누지 않고
 * **단계별 신선도**로 푼다. 1단계는 신선도가 7일이라 주 6일은 스스로 생략된다.
 * (생략은 실패가 아니다. 다음 단계로 그대로 진행한다)
 *
 * 기관마다 API 서버가 달라 콜 한도가 별개다. 그래서 예산도 따로 잡고, 한 기관이 실패해도
 * 다음 기관은 계속 돈다 — 기관끼리 데이터를 참조하지 않기 때문이다.
 *
 * [행정안전부가 맨 앞이다]
 * **유일하게 순서가 의미를 갖는 자리다.** 법정동코드는 병원 데이터가 아니라 지역의 정본이고,
 * HIRA(코드)와 NMC(이름)가 서로 다른 방식으로 주는 지역을 우리 코드로 옮길 때의 기준이 된다.
 * 정본이 낡은 채로 병원을 적재하면 새로 생긴 행정구역의 병원이 지역 없이 쌓인다.
 * 21콜 / 5초라 앞에 세우는 비용도 사실상 없다.
 *
 * 나머지(NMC·HIRA) 사이에는 순서 의존이 없다. 지금 순서는 관례일 뿐이다.
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

      // 법정동코드가 가장 먼저다. 지역 정본이라 뒤따르는 적재의 기준이 된다.
      //
      // **실패해도 멈추지 않는다.** 정본이 하루 낡는 것과 병원 적재를 하루 통째로 거르는 것
      // 중에는 전자가 낫다 — 행정구역은 수시로 바뀌지만 하루 사이에 바뀌는 일은 드물고,
      // 병원은 매일 이어받아야 진도가 나간다. 실패는 로그와 sync_state 에 남는다.
      const mois = await this.runner.runAll('mois', { budget, force });
      this.report('MOIS', mois);

      const nmc = await this.runner.runAll('nmc', { budget, force });
      this.report('NMC', nmc);

      // HIRA 는 NMC 와 독립이다. 서비스키도 한도도 별개라 NMC 가 멈춰도 여기는 돈다.
      const hira = await this.runner.runAll('hira', { budget, force });
      this.report('HIRA', hira);

      const calls = mois.calls + nmc.calls + hira.calls;
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.logger.log(`배치 완료 — 총 ${calls.toLocaleString()}콜 / ${seconds}초`);
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
        this.logger.log(`  ${label} ${run.stage}단계 생략 — ${run.result.skipReason}`);
      } else {
        this.logger.log(
          `  ${label} ${run.stage}단계 — 콜 ${run.result?.calls.toLocaleString()} / 처리 ${run.result?.processed.toLocaleString()}`,
        );
      }
    }

    if (result.budgetExhausted) {
      this.logger.log(`  ${label} 콜 예산 소진. 남은 단계는 다음 실행에서 이어받는다.`);
    }
  }
}
