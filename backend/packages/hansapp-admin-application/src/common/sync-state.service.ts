import { Injectable, Logger } from '@nestjs/common';
import { BatchRunStatus } from '@hansapp/common';

import { SyncStateRepository } from './sync-state.repository';
import { DataProvider } from './provider';
import { CLI_RUN_CONTEXT, RunContext } from './run-context';
import { BatchRunRepository } from '../log/batch-run.repository';

/** 한 번의 실행 단위. CLI 커맨드 하나에 대응한다. */
export interface SyncJob {
  provider: DataProvider;

  /** 계획 문서(krdata-cache-plan.md)의 단계 번호 */
  stage: number;

  /** 같은 단계 안의 세부 구분. 등급이나 오퍼레이션 (예: 'A', 'equipment') */
  detail?: string;
}

/**
 * 부팅 때 등록할 단계 한 건.
 *
 * **sync-runner 의 StageSpec 을 가져다 쓰지 않는다.** 그쪽은 기관별 단계 서비스를 물고,
 * 그 서비스들이 다시 이 파일을 물어서 서로를 물게 된다. 모양이 같으니 구조적으로 맞는다.
 */
export interface StageRegistration {
  readonly job: string;
  readonly provider: DataProvider;
  readonly stage: number;
  readonly description: string;
}

/** 관리자 화면이 받는 단계 한 줄. 코드 카탈로그와 DB 행을 합친 것이다. */
export interface StageView extends StageRegistration {
  readonly enabled: boolean;
  readonly status: string;
  readonly lastSuccessAt: Date | null;
  readonly nextEligibleAt: Date | null;
  readonly calls: number;
}

/** 실행 결과 집계 */
export interface SyncOutcome {
  total: number;
  processed: number;
  calls: number;

  /**
   * 콜 예산이 모자라 남은 작업을 못 하고 멈춘 경우.
   *
   * 이것을 성공과 구분하지 않으면 "예산이 2콜 남았는데 병원 하나에 11콜이 필요해서
   * 아무것도 못 한" 단계가 콜 0의 성공으로 기록된다. 그러면 뒤 단계들도 줄줄이 헛돌고,
   * 배치는 예산이 없다는 사실을 모른 채 12단계까지 훑는다.
   */
  limitReached?: boolean;
}

/**
 * 이 시간이 지나도록 running 인 단계는 죽은 것으로 본다.
 * 프로세스가 강제 종료되면 status 를 되돌릴 기회가 없어 잠금이 영구히 남기 때문이다.
 */
const STALE_LOCK_HOURS = 6;

/** job 식별자. 예: nmc.1 / nmc.2.A / hira.4.equipment */
export function jobKey(job: SyncJob): string {
  return [job.provider, job.stage, job.detail].filter(Boolean).join('.');
}

/**
 * 도는 중에 진행분을 알리는 통로.
 *
 * **몇 시간짜리 단계 때문에 있다.** 닫힐 때만 기록하면 그동안 화면에는 아무 숫자도 안 뜬다.
 * 청크가 하나 끝날 때마다 부르면 되고, 실패해도 던지지 않는다 — 진행 표시가 적재를
 * 멈추게 할 수는 없다.
 */
export type ProgressReporter = (progress: {
  processed: number;
  calls: number;
  total?: number;
}) => Promise<void>;

/** 한 단계 실행에 딸리는 부가 정보. 이력에 남기고 다음 실행 시각을 계산하는 데 쓴다. */
export interface SyncRunMeta {
  /** 어디서 온 실행인가. 생략하면 사람이 hanscli 로 부른 것으로 본다. */
  readonly context?: RunContext;

  /**
   * 이 단계의 신선도(시간). 다음에 돌 자격이 생기는 시각을 계산한다.
   *
   * **여기서 계산하지 않고 받는다.** 신선도 표(STAGE_FRESHNESS_HOURS)는 단계 서비스 쪽에
   * 있고 그쪽이 이 서비스를 쓴다 — 반대로 가져오면 서로를 물게 된다.
   */
  readonly freshnessHours?: number;
}

/**
 * 배치 단계의 실행 상태를 관리한다.
 *
 * 왜 필요한가: 8만 콜짜리 단계는 한 번에 못 끝난다(개발계정 일 1,000건). 중단·재개가 전제이고,
 * 그러려면 "무엇을 언제 성공했나"가 남아야 한다. 모니터링과 중복 실행 방지도 여기서 나온다.
 *
 * 병원 단위의 이어받기는 이 테이블이 아니라 각 병원 행의 `*_synced_at` 이 담당한다.
 * (NULL 인 병원이 곧 작업 큐다. 커서를 따로 두지 않는다)
 */
@Injectable()
export class SyncStateService {
  private readonly logger = new Logger(SyncStateService.name);

  constructor(
    private readonly repo: SyncStateRepository,
    private readonly history: BatchRunRepository,
  ) {}

  /**
   * 마지막 성공이 maxAgeHours 이내면 true — 즉 아직 신선하니 다시 돌 필요가 없다.
   *
   * 신선도 기준은 단계마다 다르다. 목록 벌크는 8만 건을 통째로 다시 받으므로 주 1회면 충분하고,
   * 개별 상세는 못 받은 병원을 이어받는 것이라 매일 돌아야 한다. 그래서 판정을 시간으로 받는다.
   *
   * 배치가 매일 같은 크론으로 전 단계를 훑어도, 목록 단계는 여기서 스스로 건너뛴다.
   * --force 면 호출부가 이 판정을 무시한다.
   */
  async isFresh(job: SyncJob, maxAgeHours: number): Promise<boolean> {
    const state = await this.repo.find(jobKey(job));
    if (!state?.lastSuccessAt) {
      return false;
    }

    /**
     * **마지막 실행이 done 이어야 신선하다.** 시각만 보면 안 된다.
     *
     * last_success_at 은 성공할 때만 갱신되고 실패해도 지워지지 않는다. 그래서
     * "예전에 성공 → 오늘 실패" 인 단계를 시각만으로 판정하면 **실패한 단계를 건너뛴다.**
     * 실제로 9단계가 그랬다 — 어제 429(한도)로 죽었는데, 그 전의 빈 실행이 남긴
     * last_success_at 때문에 하루 종일 "최근에 성공했다"며 한 콜도 안 나갔다.
     *
     *   partial  남은 작업이 있는 채로 멈췄다 → 바로 이어받는다
     *   failed   실패했다 → 다시 시도한다 (원인이 한도였다면 원본이 다시 거절할 뿐이다)
     *   running  isRunning 이 따로 잡는다
     */
    if (state.status !== 'done') {
      return false;
    }

    const ageMs = Date.now() - state.lastSuccessAt.getTime();
    return ageMs < maxAgeHours * 60 * 60 * 1000;
  }

  /**
   * 이미 다른 실행이 돌고 있으면 true. 배치와 CLI 가 같은 단계를 겹쳐 돌리지 않게 한다.
   *
   * **죽은 잠금은 무시한다.** 프로세스가 강제 종료되면(OOM·SIGKILL·컨테이너 재시작)
   * status 가 running 인 채로 영원히 남는다. 그러면 그 단계는 다시는 안 돈다.
   * 그래서 시작한 지 오래된 running 은 죽은 것으로 보고 넘어간다.
   *
   * 임계값은 가장 오래 걸리는 단계보다 넉넉해야 한다. 실측상 가장 긴 것이 HIRA 의원급
   * (하루치 10,000곳 × 11종)이라 몇 시간 단위다. 6시간이면 충분하다.
   */
  async isRunning(job: SyncJob): Promise<boolean> {
    const state = await this.repo.find(jobKey(job));
    if (state?.status !== 'running') {
      return false;
    }

    const startedAt = state.startedAt?.getTime();
    if (startedAt === undefined) {
      return false;
    }

    const ageMs = Date.now() - startedAt;
    if (ageMs > STALE_LOCK_HOURS * 60 * 60 * 1000) {
      this.logger.warn(
        `${jobKey(job)} has been running for ${Math.round(ageMs / 3_600_000)}h. Treating it as a stale lock and running again.`,
      );
      return false;
    }

    return true;
  }

  /**
   * 이 단계가 켜져 있나.
   *
   * **행이 없으면 켜진 것으로 본다.** 등록 전에 도는 순간(첫 부팅과 첫 실행 사이, 또는
   * 등록이 실패한 뒤)이 있는데, 거기서 false 를 주면 아무것도 안 돈다 —
   * 기록용 표의 사고가 적재를 멈추는 것은 본말전도다.
   */
  async isEnabled(job: SyncJob): Promise<boolean> {
    const state = await this.repo.find(jobKey(job));
    return state?.enabled ?? true;
  }

  /**
   * 부팅 때 단계를 등록한다. 설명만 덮어쓰고 enabled 는 두 손 뗀다.
   *
   * **여기서 나는 예외는 삼킨다.** 등록은 관리자 화면을 위한 것이지 적재의 조건이 아니다
   * (BatchJobService 와 같은 원칙).
   */
  async register(specs: readonly StageRegistration[]): Promise<void> {
    for (const spec of specs) {
      try {
        await this.repo.register(spec.job, spec.provider, spec.stage, spec.description);
      } catch (error) {
        this.logger.warn(`Failed to register stage ${spec.job}: ${String(error)}`);
      }
    }
  }

  /** 단계를 켜고 끈다. 관리자 콘솔만 부른다. */
  async setEnabled(spec: StageRegistration, enabled: boolean): Promise<void> {
    await this.repo.setEnabled(spec.job, spec.provider, spec.stage, enabled);
  }

  /**
   * 관리자 화면이 보는 단계 목록. **코드 카탈로그가 기준이고 DB 가 살을 붙인다.**
   *
   * DB 행만 훑으면 아직 한 번도 안 돌았고 부팅 등록도 안 된 단계가 목록에서 빠지는데,
   * 미리 꺼 두고 싶은 단계가 정확히 그것이다. 반대로 코드에서 없어진 단계는 행이 남아 있어도
   * 안 보여야 한다 — 끌 수 없는 것을 스위치로 내놓으면 안 된다.
   */
  async listStages(catalog: readonly StageRegistration[]): Promise<StageView[]> {
    const rows = await this.repo.list();
    const byJob = new Map(rows.map((row) => [row.job, row]));

    return catalog.map((spec) => {
      const row = byJob.get(spec.job);
      return {
        job: spec.job,
        provider: spec.provider,
        stage: spec.stage,
        // 설명의 정본은 코드다. DB 열은 거울이라 여기서도 코드를 먼저 본다.
        description: spec.description,
        enabled: row?.enabled ?? true,
        status: row?.status ?? 'idle',
        lastSuccessAt: row?.lastSuccessAt ?? null,
        nextEligibleAt: row?.nextEligibleAt ?? null,
        calls: row?.calls ?? 0,
      };
    });
  }

  /** 실행 시작을 기록한다. */
  async start(job: SyncJob): Promise<void> {
    await this.repo.start(jobKey(job), job.provider, job.stage);
  }

  /**
   * 성공을 기록한다.
   *
   * 한도(또는 콜 상한)에 걸려 **남은 작업이 있는 채로 멈췄으면 done 이 아니라 partial** 이다.
   * done 으로 찍으면 신선도 규칙(24시간)에 걸려 그날은 더 못 돈다. 1,000곳만 받고 끝난 단계가
   * 완료된 것처럼 굳어버린다.
   *
   * partial 은 "성공했지만 아직 남았다"는 뜻이라, 다음 실행에서 신선도를 무시하고 이어받는다.
   */
  async succeed(
    job: SyncJob,
    outcome: SyncOutcome,
    elapsedMs: number,
    freshnessHours?: number,
  ): Promise<void> {
    const now = new Date();
    await this.repo.update(jobKey(job), {
      status: outcome.limitReached ? 'partial' : 'done',
      finishedAt: now,
      lastSuccessAt: now,
      // 남은 작업이 있으면(partial) 다음 실행이 바로 이어받아야 하므로 자격이 곧바로 생긴다.
      nextEligibleAt: nextEligibleAt(now, outcome.limitReached ? 0 : freshnessHours),
      total: outcome.total,
      processed: outcome.processed,
      calls: outcome.calls,
      elapsedMs,
      error: null,
    });
  }

  /**
   * 실패를 기록한다. last_success_at 은 건드리지 않는다.
   * 실패해도 이미 받은 병원(*_synced_at)은 남으므로, 다시 돌리면 못 받은 것부터 이어간다.
   */
  async fail(job: SyncJob, error: unknown, elapsedMs: number): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${jobKey(job)} failed: ${message}`);

    await this.repo.update(jobKey(job), {
      status: 'failed',
      finishedAt: new Date(),
      // 실패했으니 다음 실행에서 바로 다시 시도해야 한다. 자격을 미루지 않는다.
      nextEligibleAt: new Date(),
      elapsedMs,
      error: message,
    });
  }

  /** 전체 상태 조회 (CLI `sync status`) */
  async list(provider?: DataProvider) {
    return this.repo.list(provider);
  }

  /**
   * 실행을 감싼다. 시작·성공·실패 기록을 한곳에서 처리한다.
   * 스킵 판정은 호출부(CLI)가 한다. 여기서 하면 --force 를 이 계층까지 끌고 와야 한다.
   *
   * **배치와 CLI 가 같이 지나는 관문이다.** 그래서 이력도 여기 한 곳에서 쌓는다 —
   * hanscli 로 돌린 단계가 저절로 같은 표에 남는 이유다.
   */
  async run(
    job: SyncJob,
    body: (report: ProgressReporter) => Promise<SyncOutcome>,
    meta: SyncRunMeta = {},
  ): Promise<SyncOutcome & { elapsedMs: number }> {
    const startedAt = Date.now();
    await this.start(job);
    const historyId = await this.openHistory(job, meta);

    try {
      const outcome = await body(this.reporter(historyId));
      const elapsedMs = Date.now() - startedAt;
      await this.succeed(job, outcome, elapsedMs, meta.freshnessHours);
      await this.closeHistory(historyId, {
        status: outcome.limitReached ? BatchRunStatus.PARTIAL : BatchRunStatus.DONE,
        finishedAt: new Date(),
        elapsedMs,
        total: outcome.total,
        processed: outcome.processed,
        calls: outcome.calls,
      });
      return { ...outcome, elapsedMs };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      await this.fail(job, error, elapsedMs);
      await this.closeHistory(historyId, {
        status: BatchRunStatus.FAILED,
        finishedAt: new Date(),
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 생략된 단계를 이력에 남긴다. sync_state 는 건드리지 않는다 — 아무 일도 안 일어났으므로.
   *
   * **이걸 부르지 않으면 이 표의 값이 절반으로 준다.** 목록 단계는 신선도가 7일이라
   * 주 6일이 생략인데, 그 6일이 통째로 빈칸이면 배치가 살아 있었는지 알 수 없다.
   */
  async recordSkip(job: SyncJob, reason: string, meta: SyncRunMeta = {}): Promise<void> {
    const context = meta.context ?? CLI_RUN_CONTEXT;
    try {
      await this.history.recordSkippedStageRun({
        job: jobKey(job),
        batchJobHistoryId: context.jobRunId,
        provider: job.provider,
        stage: job.stage,
        detail: job.detail,
        source: context.source,
        startedAt: new Date(),
        reason,
      });
    } catch (error) {
      // 이력이 배치를 막으면 안 된다. 로그만 남기고 넘어간다.
      this.logger.error(`${jobKey(job)} 생략 이력 기록 실패`, error);
    }
  }

  /**
   * 진행분을 알리는 통로를 만든다.
   *
   * 이력 행이 없으면(적재 실패) 아무 일도 안 하는 통로를 준다 — 호출부가 이력 여부를
   * 신경 쓰지 않아도 되게 한다.
   */
  private reporter(historyId: bigint | undefined): ProgressReporter {
    if (historyId === undefined) {
      return () => Promise.resolve();
    }

    return async (progress) => {
      try {
        await this.history.updateStageProgress(historyId, progress);
      } catch (error) {
        // 진행 표시가 적재를 멈추게 할 수는 없다. 한 번 놓쳐도 다음 청크가 덮어쓴다.
        this.logger.warn(`진행 기록 실패 — 실행은 계속한다: ${describe(error)}`);
      }
    };
  }

  /** 이력 행을 연다. 실패하면 undefined — 그 실행은 이력 없이 그냥 돈다. */
  private async openHistory(job: SyncJob, meta: SyncRunMeta): Promise<bigint | undefined> {
    const context = meta.context ?? CLI_RUN_CONTEXT;
    try {
      return await this.history.startStageRun({
        job: jobKey(job),
        batchJobHistoryId: context.jobRunId,
        provider: job.provider,
        stage: job.stage,
        detail: job.detail,
        source: context.source,
        startedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`${jobKey(job)} 이력 시작 기록 실패 — 실행은 계속한다`, error);
      return undefined;
    }
  }

  private async closeHistory(
    id: bigint | undefined,
    input: Parameters<BatchRunRepository['finishStageRun']>[1],
  ): Promise<void> {
    if (id === undefined) {
      return;
    }
    try {
      await this.history.finishStageRun(id, input);
    } catch (error) {
      this.logger.error('이력 종료 기록 실패', error);
    }
  }
}

/**
 * 다음에 돌 자격이 생기는 시각. 신선도를 모르면(호출부가 안 넘겼으면) 비운다 —
 * 틀린 시각을 적어 두느니 빈칸이 낫다.
 */
function nextEligibleAt(from: Date, freshnessHours?: number): Date | null {
  if (freshnessHours === undefined) {
    return null;
  }
  return new Date(from.getTime() + freshnessHours * 60 * 60 * 1000);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
