import { Injectable, Logger } from '@nestjs/common';
import { KrDataQuotaError } from '@krdata/core';

import { skipReason, StageResult, StageRunOptions } from '../nmc/nmc-stage.service';
import { SyncOutcome, SyncStateService } from '../common/sync-state.service';
import { MoisRegionSyncService } from './mois-region-sync.service';

/**
 * 행정안전부 단계 실행.
 *
 *   1  법정동코드 전량 (21콜, 매일)
 *
 * **단계가 하나뿐이고 앞으로도 늘 가능성이 낮다.** 오퍼레이션이 1개이고 전량이 21콜이라,
 * HIRA·NMC 처럼 "무엇부터 받을까"를 나눌 이유가 없다. 그래도 단계 구조를 그대로 따르는 건
 * sync_state 기록·잠금·신선도·CLI 출력을 전부 공유하기 위해서다.
 *
 * [배치에서 가장 먼저 돈다]
 * 지역은 HIRA(코드)와 NMC(이름)를 우리 코드로 옮길 때의 기준이다. 정본이 낡은 채로
 * 병원을 적재하면 새로 생긴 행정구역의 병원이 지역 없이 쌓인다. 순서는 BatchService 가 잡는다.
 */
export const MOIS_STAGES = [1] as const;
export type MoisStage = (typeof MOIS_STAGES)[number];

@Injectable()
export class MoisStageService {
  private readonly logger = new Logger(MoisStageService.name);

  constructor(
    private readonly state: SyncStateService,
    private readonly region: MoisRegionSyncService,
  ) {}

  async run(stage: MoisStage, options: StageRunOptions): Promise<StageResult> {
    const job = { provider: 'mois' as const, stage };
    const skip = await skipReason(this.state, job, stage, options);
    if (skip) {
      return {
        total: 0,
        processed: 0,
        calls: 0,
        elapsedMs: 0,
        skipped: true,
        skipReason: skip,
      };
    }

    return this.state.run(job, () => this.guard());
  }

  /** 한도 초과는 실패가 아니다. 오늘은 여기까지라는 뜻이라 다음 실행에서 이어받는다. */
  private async guard(): Promise<SyncOutcome> {
    try {
      // 배치는 항상 merge 다. replace 는 사람이 CLI 로만 고른다 —
      // 전량 교체는 되돌릴 수 없고, 무인 실행이 매일 이력을 지우면 안 된다.
      const result = await this.region.sync({ mode: 'merge' });

      this.logger.log(
        `Legal district codes applied: ${result.fetched}/${result.totalCount}` +
          ` (sido ${result.levels.sido} · sigungu ${result.levels.sggu}` +
          ` · eup/myeon/dong ${result.levels.umd} · ri ${result.levels.ri})` +
          (result.removed > 0 ? ` / retired ${result.removed}` : ''),
      );

      return {
        total: result.totalCount,
        processed: result.upserted,
        calls: result.pages,
      };
    } catch (error) {
      if (error instanceof KrDataQuotaError) {
        this.logger.warn(
          `MOIS stage 1 hit the daily quota (${error.errorCode}). Resuming tomorrow.`,
        );
        return { total: 0, processed: 0, calls: 0, limitReached: true };
      }
      throw error;
    }
  }
}
