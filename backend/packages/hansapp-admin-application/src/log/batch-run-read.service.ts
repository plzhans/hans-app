import { Injectable } from '@nestjs/common';
import { BatchRunSource, BatchRunStatus, Page } from '@hansapp/common';
import type { BatchJob, BatchJobHistory, SyncStateHistory } from '@hansapp/data';

import { BatchJobHistoryFilter, BatchRunReadRepository } from './batch-run-read.repository';
import { BatchJobRepository } from '../common/batch-job.repository';

/** 목록 한 줄 — 잡 하나의 현황 */
export interface BatchJobStatusView {
  readonly job: string;
  readonly description: string;
  readonly category: string;
  readonly cronExpression: string;
  readonly timeZone: string;

  /** 스케줄이 살아 있나. 끄면 크론 시각이 와도 안 돈다(수동 실행은 여전히 된다). */
  readonly enabled: boolean;

  readonly status: string;
  readonly lastStartedAt: Date | null;
  readonly lastFinishedAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastElapsedMs: number;
  readonly lastCalls: number;
  readonly lastProcessed: number;
  readonly lastError: string | null;
  readonly failureStreak: number;

  /** 마지막으로 이 잡을 돌린 호스트·판. "어디서 도는 잡인가" 를 카드에서 바로 본다. */
  readonly lastHostname: string | null;
  readonly lastVersion: string | null;

  readonly nextRunAt: Date | null;

  /**
   * 예정 시각이 지났는데 아직 안 돌았다.
   *
   * **이게 "스케줄러가 죽었다" 의 신호다.** next_run_at 은 회차가 끝날 때마다 다시 쓰이므로,
   * 프로세스가 살아 있으면 항상 미래를 가리킨다. 과거에 멈춰 있다는 것은 그 갱신이
   * 일어나지 않았다는 뜻이다. Sentry 가 꺼진 환경에서도 이건 동작한다.
   *
   * **끈 잡은 늘 false 다.** 일부러 멈춘 것을 "안 돌았다" 고 경보하면 거짓 경보가 되고,
   * 거짓이 섞이면 진짜 경보를 안 믿게 된다.
   */
  readonly overdue: boolean;

  /** 지금 돌고 있는 단계들. 안 돌고 있으면 빈 배열. */
  readonly runningStages: RunningStageView[];
}

/** 진행 중인 단계 한 줄 */
export interface RunningStageView {
  readonly job: string;
  readonly provider: string;
  readonly stage: number;

  /** 어떻게 불렸나. 회차 밖 실행에서는 CRON 이 아닌 값이 온다. */
  readonly source: string;

  readonly startedAt: Date;
  readonly total: number;
  readonly processed: number;
  readonly calls: number;

  /** 0~100. total 이 0 이면(아직 세기 전이면) null. */
  readonly percent: number | null;

  /**
   * 살아 있지 않은 것으로 보이는 이유. 없으면 정상적으로 도는 중이다.
   *
   * **RUNNING 은 스스로 풀리지 않는다.** 프로세스가 SIGKILL·OOM 으로 죽으면 종료 기록이
   * 안 돌아 행이 영영 RUNNING 으로 남는다. 그걸 그대로 "실행 중" 으로 보여주면 화면이
   * 거짓말을 하고, 경과 시간이 하염없이 올라간다.
   */
  readonly staleReason?: string;
}

/**
 * 이 시간을 넘도록 RUNNING 이면 죽은 것으로 본다.
 *
 * sync_state 의 죽은 잠금 판정과 같은 값을 쓴다 — 판정 기준이 두 개면 한쪽은 반드시 틀린다.
 * 가장 오래 걸리는 단계(HIRA 의원급)가 몇 시간이라 6시간이면 넉넉하다.
 */
const STALE_RUNNING_HOURS = 6;

/** 현황 화면이 한 번에 받는 것 */
export interface BatchOverviewView {
  readonly jobs: BatchJobStatusView[];

  /**
   * **사람이 직접 돌리고 있는 단계.** hanscli(CLI)나 관리자 화면(ADMIN)에서 시작한 것이다.
   *
   * 잡 회차에 붙지 않으므로 잡 카드에 얹지 않는다 — 얹으면 스케줄이 돌고 있는 것처럼
   * 보인다. 그렇다고 버리지도 않는다: 몇 시간짜리를 손으로 돌리는 동안 콘솔이 깜깜하면
   * 침묵이 정상처럼 보인다.
   */
  readonly manualStages: RunningStageView[];

  /**
   * **중단됐거나 기록이 어긋난 단계.**
   *
   * 두 갈래가 온다:
   *   · 죽은 실행 — 프로세스가 SIGKILL·OOM 으로 끊겨 RUNNING 인 채 굳은 행
   *   · 고아 행 — 크론이 돌렸는데 회차 기록이 실패했거나, 그 잡 자체가 없어진 경우
   *
   * **수동 실행과 섞지 않는다.** 사람이 시작한 것이 아니고, 사람이 손댈 것도 아니다 —
   * 저건 "봐야 하는 이상" 이고 이건 "지금 돌고 있는 일" 이라 성격이 반대다.
   */
  readonly stalledStages: RunningStageView[];
}

/**
 * 관리자 화면용 배치 현황·이력 조회.
 *
 * **상태를 숫자 그대로 내보내지 않는다.** 이력 표는 숫자로 담지만 화면이 읽는 것은 이름이다
 * (→ batch-codes.ts). 여기서 이름으로 풀어 준다.
 */
@Injectable()
export class BatchRunReadService {
  constructor(
    private readonly master: BatchJobRepository,
    private readonly runs: BatchRunReadRepository,
  ) {}

  /**
   * 현황 화면이 쓰는 것 전부 — 잡 목록 + 각 잡의 진행 상황 + 회차 밖 수동 실행.
   *
   * 진행 중인 단계는 **한 번에 다 읽어서 나눠 담는다.** 잡마다 따로 물으면 잡 수만큼
   * 쿼리가 나가는데, 지금 돌고 있는 단계는 어차피 한 줌이다.
   */
  async overview(now = new Date()): Promise<BatchOverviewView> {
    const [jobs, running] = await Promise.all([this.master.list(), this.runs.listRunningStages()]);

    const { byJob, detached } = await this.splitRunning(
      running,
      jobs.map((job) => job.job),
    );

    /*
      **잡이 응답하지 않으면 그 잡의 단계도 죽은 것이다.** 다음 실행 시각은 회차가 끝날 때마다
      다시 쓰이므로, 그것이 과거에 멈춰 있다는 것은 프로세스가 갱신을 못 하고 있다는 뜻이다.
      시간 임계(6시간)만 믿으면 그때까지 화면이 계속 "실행 중" 이라고 거짓말한다.
    */
    const unresponsive = new Set(
      jobs
        .filter((job) => job.enabled && job.nextRunAt !== null && job.nextRunAt < now)
        .map((job) => job.job),
    );

    const manualStages: RunningStageView[] = [];
    const stalledStages: RunningStageView[] = [];

    for (const stage of detached) {
      const view = toRunningStageView(stage, now);
      // 회차에 안 붙은 것 중 **사람이 시작한 것만** 수동이다. 크론인데 회차가 없으면
      // 기록이 어긋난 것이고, 죽은 채 굳은 것도 마찬가지로 이상 쪽이다.
      const manual =
        view.source === BatchRunSource[BatchRunSource.CLI] ||
        view.source === BatchRunSource[BatchRunSource.ADMIN];

      if (manual && view.staleReason === undefined) {
        manualStages.push(view);
      } else {
        stalledStages.push({
          ...view,
          staleReason: view.staleReason ?? '회차 기록이 없다 — 잡이 없어졌거나 기록이 실패했다',
        });
      }
    }

    return {
      jobs: jobs.map((job) =>
        toStatusView(
          job,
          (byJob.get(job.job) ?? []).map((stage) =>
            toRunningStageView(
              stage,
              now,
              unresponsive.has(job.job) ? '배치가 응답하지 않는다' : undefined,
            ),
          ),
        ),
      ),
      manualStages,
      stalledStages,
    };
  }

  /**
   * 진행 중인 단계를 **잡에 속한 것**과 **회차에 안 붙은 것**으로 가른다.
   *
   * **"지금 RUNNING 인 잡" 에 통째로 붙이면 안 된다.** 적재(daily-sync)는 04:00 에 시작해
   * 몇 시간 돌고 정리(auth-cleanup)는 04:30 에 뜬다 — 겹치는 것이 정상이고, 그때 어느
   * 잡의 단계인지 가릴 방법이 없어진다. 회차 번호로 정확히 되짚는다.
   *
   * 회차가 없는 단계는 보통 hanscli 로 사람이 돌린 것이지만, **크론이 돌렸는데 회차
   * 기록만 실패한 경우도 여기 온다**(기록 조각마다 guard 가 따로라 한쪽만 실패할 수 있다).
   * 둘을 출처로 갈라 한쪽을 숨기지 않는다 — 안 보이면 침묵이 정상처럼 보인다.
   *
   * **지금 없는 잡의 단계도 여기로 온다.** 잡 이름을 바꾸면 옛 이름으로 돌던 회차가 남는데,
   * 그 이름의 카드가 없으니 어디에도 안 붙어 조용히 사라진다 — 특히 그렇게 죽은 실행이
   * RUNNING 인 채로 남아 있을 때 안 보이는 게 제일 나쁘다.
   */
  private async splitRunning(
    stages: SyncStateHistory[],
    knownJobs: readonly string[],
  ): Promise<{
    byJob: Map<string, SyncStateHistory[]>;
    detached: SyncStateHistory[];
  }> {
    const known = new Set(knownJobs);
    const byJob = new Map<string, SyncStateHistory[]>();
    const detached = stages.filter((stage) => stage.batchJobHistoryId === null);

    const runIds = [
      ...new Set(
        stages.map((stage) => stage.batchJobHistoryId).filter((id): id is bigint => id !== null),
      ),
    ];
    if (runIds.length === 0) {
      return { byJob, detached };
    }

    const names = await this.runs.findJobNames(runIds);
    const jobByRunId = new Map(names.map((row) => [row.id, row.job]));

    for (const stage of stages) {
      if (stage.batchJobHistoryId === null) {
        continue;
      }
      const job = jobByRunId.get(stage.batchJobHistoryId);
      if (job === undefined || !known.has(job)) {
        // 부모 회차가 사라졌거나(보관 정책으로 잘림), 그 잡 자체가 이제 없다(이름이 바뀜).
        // 어느 카드에도 못 얹으므로 회차에 안 붙은 것들과 같이 다룬다 — 버리면 안 보인다.
        detached.push(stage);
        continue;
      }
      const list = byJob.get(job);
      if (list) {
        list.push(stage);
      } else {
        byJob.set(job, [stage]);
      }
    }

    return { byJob, detached };
  }

  /**
   * 잡 하나의 현황. **진행 중인 단계는 담지 않는다** — on/off 응답처럼 한 줄만 필요할 때 쓴다.
   * 카드 전체가 필요하면 overview() 를 쓴다.
   */
  async findJob(name: string): Promise<BatchJobStatusView | null> {
    const row = await this.master.find(name);
    return row ? toStatusView(row, []) : null;
  }

  /** 회차 이력 한 페이지. */
  async listJobRuns(
    filter: BatchJobHistoryFilter,
    page: number,
    size: number,
  ): Promise<Page<JobRunView>> {
    const [rows, total] = await this.runs.listJobRuns(filter, (page - 1) * size, size);
    return new Page(rows.map(toJobRunView), page, size, total);
  }

  /** 한 회차와 그 안의 단계들. 회차를 펼쳤을 때 쓴다. */
  async findJobRun(id: bigint): Promise<{ run: JobRunView; stages: StageRunView[] } | null> {
    const run = await this.runs.findJobRun(id);
    if (!run) {
      return null;
    }
    const stages = await this.runs.listStageRuns(id);
    return { run: toJobRunView(run), stages: stages.map(toStageRunView) };
  }

  /** 한 단계의 이력. 회차를 가리지 않으므로 hanscli 실행도 함께 나온다. */
  async listStageRuns(job: string, page: number, size: number): Promise<Page<StageRunView>> {
    const [rows, total] = await this.runs.listStageRunsByJob(job, (page - 1) * size, size);
    return new Page(rows.map(toStageRunView), page, size, total);
  }
}

/** 회차 한 줄 */
export interface JobRunView {
  readonly id: string;
  readonly job: string;
  readonly source: string;
  readonly status: string;
  readonly scheduledAt: Date | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly elapsedMs: number | null;
  /** 예정보다 늦게 시작한 밀리초. 예정이 없으면(수동 실행) null. */
  readonly delayMs: number | null;
  readonly calls: number;
  readonly processed: number;
  readonly error: string | null;
  readonly summary: unknown;

  /** 이 회차를 돌린 주체. 옛 행은 비어 있다(그때는 안 남겼다). */
  readonly hostname: string | null;
  readonly pid: number | null;
  readonly version: string | null;
}

/** 단계 한 줄 */
export interface StageRunView {
  readonly id: string;
  readonly job: string;
  readonly provider: string;
  readonly stage: number;
  readonly detail: string | null;
  readonly source: string;
  readonly status: string;
  readonly skipReason: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly elapsedMs: number;
  readonly total: number;
  readonly processed: number;
  readonly calls: number;
  readonly percent: number | null;
  readonly error: string | null;
}

function toStatusView(job: BatchJob, running: RunningStageView[]): BatchJobStatusView {
  return {
    job: job.job,
    description: job.description,
    category: job.category,
    cronExpression: job.cronExpression,
    timeZone: job.timeZone,
    enabled: job.enabled,
    status: job.status,
    lastStartedAt: job.lastStartedAt,
    lastFinishedAt: job.lastFinishedAt,
    lastSuccessAt: job.lastSuccessAt,
    lastElapsedMs: job.lastElapsedMs,
    lastCalls: job.lastCalls,
    lastProcessed: job.lastProcessed,
    lastError: job.lastError,
    failureStreak: job.failureStreak,
    lastHostname: job.lastHostname,
    lastVersion: job.lastVersion,
    nextRunAt: job.nextRunAt,
    overdue: job.enabled && job.nextRunAt !== null && job.nextRunAt < new Date(),
    runningStages: running,
  };
}

/**
 * 진행 중인 단계 한 줄.
 *
 * @param reason 바깥에서 이미 아는 사유(잡이 응답 없음 등). 시간 임계보다 먼저 본다 —
 *               6시간을 기다리지 않고도 죽은 것을 알 수 있으면 그게 낫다.
 */
function toRunningStageView(row: SyncStateHistory, now: Date, reason?: string): RunningStageView {
  const runningMs = now.getTime() - row.startedAt.getTime();
  const tooLong = runningMs > STALE_RUNNING_HOURS * 60 * 60 * 1000;

  return {
    job: row.job,
    provider: row.provider,
    stage: row.stage,
    source: sourceName(row.source),
    startedAt: row.startedAt,
    total: row.total,
    processed: row.processed,
    calls: row.calls,
    percent: percent(row.processed, row.total),
    staleReason: reason ?? (tooLong ? `${STALE_RUNNING_HOURS}시간 넘게 진행 중이다` : undefined),
  };
}

function toJobRunView(row: BatchJobHistory): JobRunView {
  return {
    // **BigInt 를 그대로 내보내면 JSON.stringify 가 던진다.** 문자열로 바꿔 보낸다.
    id: row.id.toString(),
    job: row.job,
    source: sourceName(row.source),
    status: statusName(row.status),
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    elapsedMs: row.elapsedMs,
    delayMs: row.scheduledAt === null ? null : row.startedAt.getTime() - row.scheduledAt.getTime(),
    calls: row.calls,
    processed: row.processed,
    error: row.error,
    summary: row.summary,
    hostname: row.hostname,
    pid: row.pid,
    version: row.version,
  };
}

function toStageRunView(row: SyncStateHistory): StageRunView {
  return {
    id: row.id.toString(),
    job: row.job,
    provider: row.provider,
    stage: row.stage,
    detail: row.detail,
    source: sourceName(row.source),
    status: statusName(row.status),
    skipReason: row.skipReason,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    elapsedMs: row.elapsedMs,
    total: row.total,
    processed: row.processed,
    calls: row.calls,
    percent: percent(row.processed, row.total),
    error: row.error,
  };
}

/**
 * 숫자 코드를 이름으로.
 *
 * **모르는 값이면 숫자를 그대로 문자열로 준다.** 배포 사이에 코드가 DB 보다 앞서거나
 * 뒤설 수 있는데, 그때 화면이 깨지는 것보다 "6" 이라도 보이는 편이 낫다.
 */
function statusName(code: number): string {
  return BatchRunStatus[code] ?? String(code);
}

function sourceName(code: number): string {
  return BatchRunSource[code] ?? String(code);
}

function percent(processed: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }
  return Math.min(100, Math.round((processed / total) * 100));
}
