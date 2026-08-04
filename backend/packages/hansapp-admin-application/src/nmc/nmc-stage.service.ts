import { Injectable, Logger } from '@nestjs/common';
import { KrDataQuotaError } from '@krdata/core';

import {
  SyncJob,
  SyncOutcome,
  SyncStateService,
} from '../common/sync-state.service';
import { NmcBabySyncService } from './nmc-baby-sync.service';
import { NmcBasicSyncService } from './nmc-basic-sync.service';
import { NmcCodeSyncService } from './nmc-code-sync.service';
import { NmcHospitalSyncService } from './nmc-hospital-sync.service';
import { NmcSubjectSyncService } from './nmc-subject-sync.service';

/**
 * NMC 단계 실행.
 *
 * 단계 번호는 계획 문서(docs/krdata-cache-plan.md)와 1:1 이다.
 *
 *   1  전체 병원 벌크 + 역조회 (62콜, 매일)
 *   2  규모기관 basic (3,951콜) — 등급 순서: 종합 → 병원 → 한방 → 치과 → 요양
 *   3  의원급 basic (74,680콜) — 운영계정 필요
 *
 * NMC 는 개별 조회 API 가 basic 하나뿐이라 사다리가 여기서 끝난다.
 * (HIRA 는 11종이라 등급 × 오퍼레이션으로 훨씬 길다)
 */
export const NMC_STAGES = [1, 2, 3] as const;
export type NmcStage = (typeof NMC_STAGES)[number];

/** 단계 실행 옵션 */
export interface StageRunOptions {
  /** 오늘 이미 성공했어도 다시 돌린다. 개별 조회 단계에서는 받은 병원도 다시 받는다. */
  force?: boolean;

  /** 이번 실행에서 쓸 최대 API 콜 수. 개발계정 일 한도(1,000건) 대응이다. */
  limit?: number;

  /**
   * 받을 오퍼레이션. HIRA 상세 단계(2~12)에서만 쓴다. 생략하면 11종 전부다.
   *
   * 평소에는 쓰지 마라 — 등급 하나를 11종으로 **완성**하는 게 기본 원칙이고,
   * 오퍼레이션별로 훑으면 어느 병원도 완성되지 않은 채 콜만 나간다.
   * 새 오퍼레이션을 뒤늦게 추가해 그것만 채워 넣을 때를 위한 통로다.
   */
  ops?: readonly string[];
}

export interface StageResult extends SyncOutcome {
  elapsedMs: number;

  /** 아직 신선해서(또는 실행 중이라) 건너뛴 경우 */
  skipped?: boolean;

  /** 건너뛴 이유 */
  skipReason?: string;
}

/**
 * 단계별 신선도(시간). 이 시간 안에 성공했으면 다시 돌지 않는다.
 *
 * 배치는 매일 같은 크론으로 1단계부터 끝까지 훑는다. 그래도 목록 단계(1)는
 * 여기 정한 168시간(7일) 때문에 대부분의 날에 스스로 건너뛴다.
 *
 *   1단계  목록 벌크. 8만 건을 통째로 다시 받는다 → 주 1회면 충분하다
 *   2단계~ 개별 상세. 못 받은 병원을 이어받는다 → 매일 돌아야 진도가 나간다
 *          (큐가 비면 콜 0으로 즉시 끝나므로 매일 돌아도 부담이 없다)
 *
 * **병원 기관(NMC·HIRA)의 기준이다.** 단계 번호가 같아도 기관이 다르면 의미가 다르므로,
 * 다른 값을 쓰는 기관은 PROVIDER_FRESHNESS_HOURS 로 덮어쓴다.
 */
export const STAGE_FRESHNESS_HOURS: Record<number, number> = {
  1: 24 * 7,
};

export const DEFAULT_FRESHNESS_HOURS = 24;

/**
 * 기관별 신선도 예외. 단계 번호만으로 판정하면 틀리는 자리다.
 *
 * **행정안전부 1단계는 매일 돌아야 한다.** 같은 "1단계" 지만 병원 목록 벌크(8만 건)와
 * 성격이 완전히 다르다 — 전량이 21콜 / 9초이고, 갱신주기가 '수시'이며, 무엇보다
 * 다른 기관 적재가 이 정본을 기준으로 지역을 매긴다. 주 1회로 두면 행정구역이 바뀐 주에
 * 최대 6일간 새 지역의 병원이 지역 없이 쌓인다.
 */
export const PROVIDER_FRESHNESS_HOURS: Record<
  string,
  Record<number, number>
> = {
  mois: { 1: 24 },
};

export function freshnessHours(stage: number, provider?: string): number {
  const override =
    provider === undefined
      ? undefined
      : PROVIDER_FRESHNESS_HOURS[provider]?.[stage];
  return override ?? STAGE_FRESHNESS_HOURS[stage] ?? DEFAULT_FRESHNESS_HOURS;
}

/**
 * 건너뛸 이유를 돌려준다. 없으면 undefined.
 * 배치와 CLI 가 같은 판정을 쓰도록 여기 한 곳에 둔다.
 */
export async function skipReason(
  state: SyncStateService,
  job: SyncJob,
  stage: number,
  options: StageRunOptions,
): Promise<string | undefined> {
  // 실행 중인 단계는 --force 여도 겹쳐 돌리지 않는다. 콜만 두 배로 쓴다.
  if (await state.isRunning(job)) {
    return '이미 실행 중이다';
  }
  if (options.force) {
    return undefined;
  }

  const hours = freshnessHours(stage, job.provider);
  if (await state.isFresh(job, hours)) {
    const days = hours / 24;
    return days >= 1
      ? `최근 ${days}일 이내에 성공했다`
      : `최근 ${hours}시간 이내에 성공했다`;
  }
  return undefined;
}

@Injectable()
export class NmcStageService {
  private readonly logger = new Logger(NmcStageService.name);

  constructor(
    private readonly state: SyncStateService,
    private readonly hospital: NmcHospitalSyncService,
    private readonly code: NmcCodeSyncService,
    private readonly baby: NmcBabySyncService,
    private readonly subject: NmcSubjectSyncService,
    private readonly basic: NmcBasicSyncService,
  ) {}

  async run(stage: NmcStage, options: StageRunOptions): Promise<StageResult> {
    const job = { provider: 'nmc' as const, stage };
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

  /**
   * 한도 초과를 실패와 구분한다.
   *
   * 벌크·역조회(1단계)는 도중에 멈추면 부분 적재 상태가 되지만, 다음 실행에서 처음부터
   * 다시 받으므로 문제가 없다(전량 덮어쓰기라 멱등하다). 개별 조회(2·3단계)는 서비스 안에서
   * 이미 부분 결과를 들고 나오므로 여기까지 오지 않는다.
   */
  private async guard(
    stage: NmcStage,
    options: StageRunOptions,
  ): Promise<SyncOutcome> {
    try {
      return await this.execute(stage, options);
    } catch (error) {
      if (error instanceof KrDataQuotaError) {
        this.logger.warn(
          `NMC ${stage}단계 — 일일 호출 한도 초과(${error.errorCode}). 내일 이어받는다.`,
        );
        return { total: 0, processed: 0, calls: 0, limitReached: true };
      }
      throw error;
    }
  }

  private async execute(
    stage: NmcStage,
    options: StageRunOptions,
  ): Promise<SyncOutcome> {
    switch (stage) {
      case 1:
        return this.stage1();
      case 2:
        // 규모기관. 등급 순서(종합 → 병원 → 한방 → 치과 → 요양)는 서비스가 정한다.
        return this.basic.sync({ limit: options.limit, force: options.force });
      case 3:
        // 의원급. 병상 0·장비 0~1종이라 얻는 게 적고 74,680콜이 든다.
        return this.basic.sync({
          clinics: true,
          limit: options.limit,
          force: options.force,
        });
    }
  }

  /**
   * 1단계 — 전체 병원 벌크 + 역조회. 62콜.
   *
   * 순서가 중요하다. 코드마스터(D000 진료과목)가 있어야 역조회가 돌 과목 목록을 안다.
   * 병원 목록이 있어야 지역 집계가 나온다.
   */
  private async stage1(): Promise<SyncOutcome> {
    const outcome: SyncOutcome = { total: 0, processed: 0, calls: 0 };

    this.logger.log('NMC 1단계 (1/4) 코드마스터');
    const code = await this.code.sync();
    outcome.calls += code.pages;
    outcome.processed += code.upserted;

    this.logger.log('NMC 1단계 (2/4) 병원 전체 (fulldown)');
    const hospital = await this.hospital.sync({ full: true });
    outcome.calls += hospital.pages;
    outcome.processed += hospital.upserted;
    outcome.total = hospital.totalCount;

    this.logger.log('NMC 1단계 (3/4) 달빛어린이병원');
    const baby = await this.baby.sync();
    outcome.calls += baby.calls;
    outcome.processed += baby.processed;

    this.logger.log('NMC 1단계 (4/4) 진료과목 역조회 (QD)');
    const subject = await this.subject.sync();
    outcome.calls += subject.calls;
    outcome.processed += subject.processed;

    return outcome;
  }
}
