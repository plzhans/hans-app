import { Injectable, Logger } from '@nestjs/common';
import { BatchCategory, BatchRunSource, BatchRunStatus } from '@hansapp/common';

import { BatchJobRegistration, BatchJobRepository } from './batch-job.repository';
import { BatchRunRepository, type RunnerIdentity } from '../log/batch-run.repository';

/** 잡을 등록할 때 코드가 넘기는 명세 */
export interface BatchJobSpec {
  readonly job: string;
  readonly description: string;
  readonly category: BatchCategory;
  readonly cronExpression: string;
  readonly timeZone: string;
  /** CronJob.nextDate() 가 알려준 다음 실행 시각 */
  readonly nextRunAt?: Date;
}

/** 회차가 끝났을 때의 결과 */
export interface JobRunOutcome {
  readonly status: BatchRunStatus;
  readonly calls?: number;
  readonly processed?: number;
  readonly error?: string;
  readonly summary?: unknown;
  /** 다음 실행 예정 시각. 크론이 아닌 실행(--once)은 없다. */
  readonly nextRunAt?: Date;
}

/** 열린 회차의 손잡이. 닫을 때 그대로 돌려준다. */
export interface OpenJobRun {
  readonly job: string;
  readonly historyId?: bigint;
  readonly startedAt: Date;
}

/**
 * 잡 회차의 시작·종료를 기록한다. 마스터(batch_job)와 이력(batch_job_history)을 함께 본다.
 *
 * **이력 적재가 배치를 막으면 안 된다.** 로그 DB 가 잠깐 죽었다고 적재가 멈추는 것은
 * 본말전도다 — 여기서 나는 예외는 전부 삼키고 로그만 남긴다(LlmUsageService 와 같은 원칙).
 * 마스터 쪽도 마찬가지다. 기록은 실행에 곁들이는 것이지 실행의 조건이 아니다.
 */
@Injectable()
export class BatchJobService {
  private readonly logger = new Logger(BatchJobService.name);

  constructor(
    private readonly master: BatchJobRepository,
    private readonly history: BatchRunRepository,
  ) {}

  /**
   * 이 프로세스가 누구인가. 호출부(배치 앱)가 부팅 때 한 번 심어 준다.
   *
   * **응용 계층은 자기가 어디서 도는지 스스로 알아내지 않는다.** os.hostname() 이나
   * build-info 는 실행 환경의 것이라, 여기서 읽으면 CLI·API 가 이 서비스를 쓸 때
   * 엉뚱한 값이 박힌다. 심어 주지 않으면 그냥 안 남긴다(예전과 같은 동작).
   */
  private runner?: RunnerIdentity;

  setRunner(runner: RunnerIdentity): void {
    this.runner = runner;
  }

  /** 부팅 때 잡을 등록한다. 크론식·분류·설명은 코드가 정본이고 여기 실린 것은 거울이다. */
  async register(spec: BatchJobSpec): Promise<void> {
    await this.guard('잡 등록', () =>
      this.master.register({
        job: spec.job,
        description: spec.description,
        category: BatchCategory[spec.category],
        cronExpression: spec.cronExpression,
        timeZone: spec.timeZone,
        nextRunAt: spec.nextRunAt,
      } satisfies BatchJobRegistration),
    );
  }

  /**
   * 회차를 연다. 마스터를 RUNNING 으로 바꾸고 이력 행을 만든다.
   *
   * 이력 적재가 실패해도 손잡이는 돌려준다(historyId 만 빈다) — 그래야 호출부가
   * 기록 여부와 상관없이 같은 흐름을 탄다.
   */
  async start(job: string, source: BatchRunSource, scheduledAt?: Date): Promise<OpenJobRun> {
    const startedAt = new Date();

    await this.guard('회차 시작 기록', () =>
      this.master.update(job, {
        status: BatchRunStatus[BatchRunStatus.RUNNING],
        lastStartedAt: startedAt,
        lastFinishedAt: null,
        lastError: null,
        // 카드에서 "어디서 도는 잡인가" 가 바로 보이게 마스터에도 남긴다.
        lastHostname: this.runner?.hostname ?? null,
        lastVersion: this.runner?.version ?? null,
      }),
    );

    const historyId = await this.guard('회차 이력 시작', () =>
      this.history.startJobRun({ job, source, scheduledAt, startedAt, runner: this.runner }),
    );

    return { job, historyId, startedAt };
  }

  /** 회차를 닫는다. */
  async finish(run: OpenJobRun, outcome: JobRunOutcome): Promise<void> {
    const finishedAt = new Date();
    const elapsedMs = finishedAt.getTime() - run.startedAt.getTime();
    const succeeded =
      outcome.status === BatchRunStatus.DONE || outcome.status === BatchRunStatus.PARTIAL;

    await this.guard('회차 종료 기록', () =>
      this.master.update(run.job, {
        status: BatchRunStatus[outcome.status],
        lastFinishedAt: finishedAt,
        lastElapsedMs: elapsedMs,
        lastCalls: outcome.calls ?? 0,
        lastProcessed: outcome.processed ?? 0,
        lastError: outcome.error ?? null,
        // 실패해도 지우지 않는다. "언제부터 망가졌나" 를 이 값으로 본다.
        ...(succeeded ? { lastSuccessAt: finishedAt } : {}),
        // 성공하면 0 으로 되돌리고, 아니면 하나 올린다.
        failureStreak: succeeded ? 0 : { increment: 1 },
        ...(outcome.nextRunAt ? { nextRunAt: outcome.nextRunAt } : {}),
      }),
    );

    if (run.historyId === undefined) {
      return;
    }

    await this.guard('회차 이력 종료', () =>
      this.history.finishJobRun(run.historyId as bigint, {
        status: outcome.status,
        finishedAt,
        elapsedMs,
        calls: outcome.calls,
        processed: outcome.processed,
        error: outcome.error,
        summary: outcome.summary,
      }),
    );
  }

  /**
   * 크론은 떴는데 돌지 못한 회차를 남긴다.
   *
   * **마스터는 건드리지 않는다.** 그 순간 마스터는 이전 회차 때문에 RUNNING 인데,
   * 여기서 SKIPPED 로 덮으면 돌고 있는 회차가 끝난 것처럼 보인다.
   */
  async skip(
    job: string,
    source: BatchRunSource,
    reason: string,
    scheduledAt?: Date,
  ): Promise<void> {
    await this.guard('생략 회차 기록', () =>
      this.history.recordSkippedJobRun({
        job,
        source,
        scheduledAt,
        startedAt: new Date(),
        reason,
        runner: this.runner,
      }),
    );
  }

  /**
   * 스케줄 on/off 를 바꾼다.
   *
   * **여기만 guard 로 감싸지 않는다.** 다른 기록은 실패해도 실행이 계속돼야 하지만, 이건
   * 관리자가 누른 조치라 실패했으면 실패했다고 알려야 한다 — 껐다고 화면에 떠 있는데
   * 실제로는 안 꺼진 것이 제일 나쁘다.
   */
  setEnabled(job: string, enabled: boolean) {
    return this.master.setEnabled(job, enabled);
  }

  /** 크론 시각에 이 잡을 돌려도 되나. 끈 잡이면 false. */
  async isEnabled(job: string): Promise<boolean> {
    // 못 읽으면 돌린다. 조회 실패로 적재가 멈추는 것보다 한 번 더 도는 편이 낫다
    // (겹침은 락이 따로 막는다).
    const row = await this.guard('스케줄 상태 조회', () => this.master.find(job));
    return row?.enabled ?? true;
  }

  /**
   * 등록되지 않은 잡을 마스터에서 지운다. **모든 잡을 등록한 뒤에 부른다.**
   *
   * 지운 이름을 돌려준다 — 조용히 사라지면 "내가 만든 잡이 왜 없지" 로 되돌아온다.
   */
  async pruneExcept(names: readonly string[]): Promise<string[]> {
    return (await this.guard('사라진 잡 정리', () => this.master.pruneExcept(names))) ?? [];
  }

  /** 전체 현황. 콘솔이 분류로 묶어 보여준다. */
  list() {
    return this.master.list();
  }

  /**
   * 기록 한 조각을 감싼다. **던지지 않는다** — 실패하면 로그만 남기고 undefined 를 돌려준다.
   * 호출부는 기록이 됐는지 안 됐는지와 무관하게 제 할 일을 계속한다.
   */
  private async guard<T>(label: string, body: () => Promise<T>): Promise<T | undefined> {
    try {
      return await body();
    } catch (error) {
      this.logger.error(`${label} 실패 — 실행은 계속한다`, error);
      return undefined;
    }
  }
}
