import { Injectable, Logger } from '@nestjs/common';
import { KrDataQuotaError } from '@krdata/core';

import {
  skipReason,
  StageResult,
  StageRunOptions,
} from '../nmc/nmc-stage.service';
import { SyncOutcome, SyncStateService } from '../common/sync-state.service';
import { HiraCodeSyncService } from './hira-code-sync.service';
import { HiraHospitalSyncService } from './hira-hospital-sync.service';
import {
  HiraDetailSyncService,
  type HiraDetailOp,
} from './hira-detail-sync.service';
import { HiraSubjectSyncService } from './hira-subject-sync.service';

/**
 * HIRA 단계 실행.
 *
 * 단계 번호는 계획 문서(docs/krdata-cache-plan.md)와 1:1 이다.
 *
 *   1   전체 병원 벌크 + 역조회 (108콜, 매일)
 *   2~8 규모기관 4,231개 × 개별 11종 — 등급 단위로 완성한다        — 미구현
 *       2 상급종합 47 · 3 종합 338 · 4 병원 1,429 · 5 정신 261
 *       6 한방 624 · 7 치과 247 · 8 요양 1,285
 *   9~12 의원급 75,508개 × 11종 — 운영계정 필요                    — 미구현
 *
 * NMC 는 basic 한 콜이면 병원 하나가 끝나지만, HIRA 는 11콜을 써야 끝난다.
 * 그래서 실행 단위가 오퍼레이션이 아니라 **병원 등급**이다. 한 등급을 잡으면 11종을 다 돌린다.
 * 오퍼레이션별로 훑으면 어느 병원도 완성되지 않은 채 콜만 소모된다.
 */
export const HIRA_STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type HiraStage = (typeof HIRA_STAGES)[number];

/** 단계별 대상 종별코드. 1단계는 전체라 비어 있다. */
export const HIRA_STAGE_CLASSES: Record<HiraStage, string | null> = {
  1: null,
  2: '01', // 상급종합 47
  3: '11', // 종합병원 338
  4: '21', // 병원 1,429
  5: '29', // 정신병원 261
  6: '92', // 한방병원 624
  7: '41', // 치과병원 247
  8: '28', // 요양병원 1,285 — 응급·중증이 없어 맨 뒤다
  9: '31', // 의원 37,789
  10: '51', // 치과의원 19,380
  11: '93', // 한의원 14,873
  12: null, // 보건기관 등 나머지
};

@Injectable()
export class HiraStageService {
  private readonly logger = new Logger(HiraStageService.name);

  constructor(
    private readonly state: SyncStateService,
    private readonly hospital: HiraHospitalSyncService,
    private readonly code: HiraCodeSyncService,
    private readonly subject: HiraSubjectSyncService,
    private readonly detail: HiraDetailSyncService,
  ) {}

  async run(stage: HiraStage, options: StageRunOptions): Promise<StageResult> {
    const job = { provider: 'hira' as const, stage };
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

    return this.state.run(job, () => this.guard(stage, options));
  }

  /** 한도 초과는 실패가 아니다. 오늘은 여기까지라는 뜻이라 다음 실행에서 이어받는다. */
  private async guard(
    stage: HiraStage,
    options: StageRunOptions,
  ): Promise<SyncOutcome> {
    try {
      return await this.execute(stage, options);
    } catch (error) {
      if (error instanceof KrDataQuotaError) {
        this.logger.warn(
          `HIRA ${stage}단계 — 일일 호출 한도 초과(${error.errorCode}). 내일 이어받는다.`,
        );
        return { total: 0, processed: 0, calls: 0, limitReached: true };
      }
      throw error;
    }
  }

  private async execute(
    stage: HiraStage,
    options: StageRunOptions,
  ): Promise<SyncOutcome> {
    if (stage === 1) {
      return this.stage1();
    }

    const clCd = HIRA_STAGE_CLASSES[stage];

    // 12단계는 나머지 전부다(보건소·보건지소·보건진료소·조산원·보건의료원).
    // 앞 단계들이 가져간 종별을 빼고 남은 것을 대상으로 한다.
    if (clCd === null) {
      const covered = Object.values(HIRA_STAGE_CLASSES).filter(
        (cd): cd is string => cd !== null,
      );
      return this.detail.sync({
        excludeClCds: covered,
        limit: options.limit,
        force: options.force,
        ops: options.ops as readonly HiraDetailOp[] | undefined,
      });
    }

    return this.detail.sync({
      clCd,
      limit: options.limit,
      force: options.force,
      ops: options.ops as readonly HiraDetailOp[] | undefined,
    });
  }

  /**
   * 1단계 — 전체 병원 벌크 + 역조회. 108콜.
   *
   * 코드(subject 6종)가 있어야 역조회가 돌 과목 목록을 안다. 그래서 코드가 먼저다.
   */
  private async stage1(): Promise<SyncOutcome> {
    const outcome: SyncOutcome = { total: 0, processed: 0, calls: 0 };

    this.logger.log('HIRA 1단계 (1/3) 코드 6종');
    for (const result of await this.code.sync()) {
      outcome.calls += result.pages;
      outcome.processed += result.upserted;
    }

    this.logger.log('HIRA 1단계 (2/3) 병원 전체 (hospital list)');
    const hospital = await this.hospital.sync({ full: true });
    outcome.calls += hospital.pages;
    outcome.processed += hospital.upserted;
    outcome.total = hospital.totalCount;

    this.logger.log('HIRA 1단계 (3/3) 진료과목 역조회 (dgsbjtCd)');
    const subject = await this.subject.sync();
    outcome.calls += subject.calls;
    outcome.processed += subject.processed;

    return outcome;
  }
}
