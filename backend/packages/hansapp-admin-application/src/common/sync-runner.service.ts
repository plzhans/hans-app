import { Injectable, Logger } from '@nestjs/common';

import {
  HIRA_STAGES,
  HiraStage,
  HiraStageService,
} from '../hira/hira-stage.service';
import {
  NMC_STAGES,
  NmcStage,
  NmcStageService,
  StageResult,
} from '../nmc/nmc-stage.service';
import {
  MOIS_STAGES,
  MoisStage,
  MoisStageService,
} from '../mois/mois-stage.service';
import { DataProvider } from './provider';

/** 한 단계의 실행 결과 */
export interface StageRun {
  provider: DataProvider;
  stage: number;
  result?: StageResult;
  error?: string;
}

export interface RunAllOptions {
  /**
   * 이번 실행에서 쓸 **전체** API 콜 예산. 단계별이 아니라 실행 전체다.
   *
   * 단계마다 한도를 주면 12개 단계 × 1,000콜 = 12,000콜이 되어 일 한도(1,000)를 넘긴다.
   * 그래서 예산을 하나 두고 단계가 실제로 쓴 만큼 깎는다. 생략된 단계는 0콜이라 예산이 그대로 남는다.
   */
  budget?: number;

  /** 신선도·중복 판정을 무시한다 */
  force?: boolean;
}

export interface RunAllResult {
  runs: StageRun[];
  calls: number;

  /** 예산 소진으로 남은 단계를 못 돈 경우 */
  budgetExhausted: boolean;
}

/**
 * 한 기관의 전 단계를 **순서대로** 실행한다. 배치(hansapp-batch)와 CLI 가 공유한다.
 *
 * 규칙 셋:
 *   1. 생략(skip)은 실패가 아니다. 다음 단계로 계속 간다.
 *      1단계(목록 벌크)는 신선도가 7일이라 주 6일은 스스로 생략된다. 그래서 크론은 하나면 된다.
 *   2. 실패하면 **거기서 멈춘다.** 원본이 맛이 갔거나 콜 한도에 걸린 상황일 가능성이 커서,
 *      계속 두드리면 콜만 버린다. 다음 실행에서 실패한 단계부터 다시 시도한다.
 *      이미 받은 병원은 *_synced_at 이 있어 건너뛰므로 재시도 비용이 거의 없다.
 *   3. 예산은 실행 전체에 하나다. 앞 단계가 남긴 만큼만 뒤 단계가 쓴다.
 */
@Injectable()
export class SyncRunnerService {
  private readonly logger = new Logger(SyncRunnerService.name);

  constructor(
    private readonly mois: MoisStageService,
    private readonly nmc: NmcStageService,
    private readonly hira: HiraStageService,
  ) {}

  async runAll(
    provider: DataProvider,
    options: RunAllOptions = {},
  ): Promise<RunAllResult> {
    const stages: readonly number[] = STAGES_BY_PROVIDER[provider];

    const runs: StageRun[] = [];
    let spent = 0;

    for (const stage of stages) {
      const remaining =
        options.budget === undefined ? undefined : options.budget - spent;

      if (remaining !== undefined && remaining <= 0) {
        this.logger.log(
          `${provider} 콜 예산(${options.budget})을 다 썼다. ${stage}단계부터는 다음 실행에서 이어받는다.`,
        );
        return { runs, calls: spent, budgetExhausted: true };
      }

      try {
        const result = await this.runStage(provider, stage, {
          force: options.force,
          limit: remaining,
        });

        spent += result.calls;
        runs.push({ provider, stage, result });

        this.logger.log(
          result.skipped
            ? `${provider} ${stage}단계 생략 — ${result.skipReason}`
            : `${provider} ${stage}단계 완료 — 콜 ${result.calls.toLocaleString()} / 처리 ${result.processed.toLocaleString()}`,
        );

        // 예산이 모자라 남은 작업을 못 한 단계가 나왔다. 뒤 단계는 더더욱 못 한다.
        // 여기서 멈추지 않으면 남은 단계가 전부 "콜 0 성공" 으로 기록된다.
        if (result.limitReached) {
          this.logger.log(
            `${provider} 콜 예산(${options.budget})을 다 썼다. 남은 단계는 다음 실행에서 이어받는다.`,
          );
          return { runs, calls: spent, budgetExhausted: true };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`${provider} ${stage}단계 실패 — ${message}`);
        runs.push({ provider, stage, error: message });

        // 실패는 중단이다. 뒤 단계를 돌리지 않는다.
        return { runs, calls: spent, budgetExhausted: false };
      }
    }

    return { runs, calls: spent, budgetExhausted: false };
  }

  private runStage(
    provider: DataProvider,
    stage: number,
    options: { force?: boolean; limit?: number },
  ): Promise<StageResult> {
    switch (provider) {
      case 'mois':
        return this.mois.run(stage as MoisStage, options);
      case 'nmc':
        return this.nmc.run(stage as NmcStage, options);
      case 'hira':
        return this.hira.run(stage as HiraStage, options);
    }
  }
}

/** 기관별 단계 목록. 기관을 추가하면 여기에만 넣으면 된다. */
const STAGES_BY_PROVIDER: Record<DataProvider, readonly number[]> = {
  mois: MOIS_STAGES,
  nmc: NMC_STAGES,
  hira: HIRA_STAGES,
};
