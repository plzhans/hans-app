import { Injectable } from '@nestjs/common';
import { LogPrisma, PrismaLogService } from '@hansapp/data';
import { BatchRunStatus } from '@hansapp/common';

/**
 * 이 회차를 돌린 주체.
 *
 * **어디서 도는지 모르는 상태가 실제로 벌어져서 남긴다.** 옛 빌드가 어딘가에 떠서
 * 회차를 계속 만드는데 호스트를 특정할 근거가 없었다. version 이 특히 값을 한다 —
 * 이상한 동작은 대개 옛 산출물이 남아 있는 것이라, 판을 보면 바로 갈린다.
 */
export interface RunnerIdentity {
  readonly hostname: string;
  readonly pid: number;
  readonly version: string;
}

/** 잡 회차를 열 때 필요한 값 */
export interface JobRunStart {
  readonly job: string;
  readonly source: number;
  /** 원래 돌기로 했던 시각(직전 next_run_at). 사람이 부른 회차는 없다. */
  readonly scheduledAt?: Date;
  readonly startedAt: Date;
  readonly runner?: RunnerIdentity;
}

/** 잡 회차를 닫을 때의 결과 */
export interface JobRunFinish {
  readonly status: BatchRunStatus;
  readonly finishedAt: Date;
  readonly elapsedMs: number;
  readonly calls?: number;
  readonly processed?: number;
  readonly error?: string;
  /** 잡마다 모양이 다른 요약. 열로 못 뽑는 것만 담는다. */
  readonly summary?: unknown;
}

/** 단계 실행을 열 때 필요한 값 */
export interface StageRunStart {
  readonly job: string;
  readonly batchJobHistoryId?: bigint;
  readonly provider: string;
  readonly stage: number;
  readonly detail?: string;
  readonly source: number;
  readonly startedAt: Date;
}

/** 단계 실행을 닫을 때의 결과 */
export interface StageRunFinish {
  readonly status: BatchRunStatus;
  readonly finishedAt: Date;
  readonly elapsedMs: number;
  readonly total?: number;
  readonly processed?: number;
  readonly calls?: number;
  readonly error?: string;
}

/**
 * 배치 실행 이력 저장소. 로그 DB(PrismaLogService)에 **쌓기만** 한다.
 *
 * **행은 시작할 때 만들고 끝날 때 고친다.** 끝날 때 한 번만 넣으면 SIGKILL·OOM 으로 죽은
 * 실행이 이력에서 통째로 사라진다 — 무엇을 하다 죽었는지가 가장 알고 싶은 경우인데도.
 * 그렇게 죽은 행은 RUNNING 인 채로 남고, 그 자체가 신호가 된다.
 *
 * 상태·출처는 숫자로 담는다(→ @hansapp/common 의 batch-codes.ts). 이름으로 바꾸는 것은
 * 응답을 만드는 자리가 한다.
 */
@Injectable()
export class BatchRunRepository {
  constructor(private readonly prisma: PrismaLogService) {}

  /** 잡 회차를 연다. 돌려준 id 를 단계 이력이 부모로 삼는다. */
  async startJobRun(input: JobRunStart): Promise<bigint> {
    const row = await this.prisma.batchJobHistory.create({
      data: {
        job: input.job,
        source: input.source,
        status: BatchRunStatus.RUNNING,
        scheduledAt: input.scheduledAt ?? null,
        startedAt: input.startedAt,
        hostname: input.runner?.hostname ?? null,
        pid: input.runner?.pid ?? null,
        version: input.runner?.version ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  /** 잡 회차를 닫는다. */
  async finishJobRun(id: bigint, input: JobRunFinish): Promise<void> {
    await this.prisma.batchJobHistory.update({
      where: { id },
      data: {
        status: input.status,
        finishedAt: input.finishedAt,
        elapsedMs: input.elapsedMs,
        calls: input.calls ?? 0,
        processed: input.processed ?? 0,
        error: input.error ?? null,
        // undefined 를 그대로 넘기면 Prisma 가 "안 고침" 으로 읽어 이전 값이 남는다.
        summary: toJson(input.summary),
      },
    });
  }

  /**
   * 돌지 못한 회차를 한 행으로 남긴다.
   *
   * 크론은 떴는데 이전 회차가 안 끝나 그냥 돌아간 경우다. **이걸 안 남기면 그 시각에
   * 크론이 떴다는 사실 자체가 사라진다** — 프로세스가 죽은 것과 구별이 안 된다.
   */
  async recordSkippedJobRun(input: JobRunStart & { reason: string }): Promise<void> {
    await this.prisma.batchJobHistory.create({
      data: {
        job: input.job,
        source: input.source,
        status: BatchRunStatus.SKIPPED,
        scheduledAt: input.scheduledAt ?? null,
        startedAt: input.startedAt,
        finishedAt: input.startedAt,
        elapsedMs: 0,
        error: input.reason,
        hostname: input.runner?.hostname ?? null,
        pid: input.runner?.pid ?? null,
        version: input.runner?.version ?? null,
      },
    });
  }

  /** 단계 실행을 연다. */
  async startStageRun(input: StageRunStart): Promise<bigint> {
    const row = await this.prisma.syncStateHistory.create({
      data: {
        job: input.job,
        batchJobHistoryId: input.batchJobHistoryId ?? null,
        provider: input.provider,
        stage: input.stage,
        detail: input.detail ?? null,
        source: input.source,
        status: BatchRunStatus.RUNNING,
        startedAt: input.startedAt,
      },
      select: { id: true },
    });
    return row.id;
  }

  /**
   * 도는 중인 단계의 진행분을 갱신한다.
   *
   * **끝나야 알 수 있으면 진행상황이 아니다.** HIRA 상세 단계는 몇 시간을 도는데, 닫힐 때만
   * 쓰면 그동안 화면에는 `RUNNING / 0건` 만 뜬다. 청크가 하나 끝날 때마다 여기를 지난다 —
   * 청크 하나가 수십 초라 쓰기가 잦지 않다.
   */
  async updateStageProgress(
    id: bigint,
    input: { processed: number; calls: number; total?: number },
  ): Promise<void> {
    await this.prisma.syncStateHistory.update({
      where: { id },
      data: {
        processed: input.processed,
        calls: input.calls,
        ...(input.total === undefined ? {} : { total: input.total }),
      },
    });
  }

  /** 단계 실행을 닫는다. */
  async finishStageRun(id: bigint, input: StageRunFinish): Promise<void> {
    await this.prisma.syncStateHistory.update({
      where: { id },
      data: {
        status: input.status,
        finishedAt: input.finishedAt,
        elapsedMs: input.elapsedMs,
        total: input.total ?? 0,
        processed: input.processed ?? 0,
        calls: input.calls ?? 0,
        error: input.error ?? null,
      },
    });
  }

  /**
   * 생략된 단계를 한 행으로 남긴다.
   *
   * **이게 이 표를 만든 이유의 절반이다.** 목록 단계는 신선도가 7일이라 주 6일이 생략인데,
   * 그동안 sync_state 는 미동도 하지 않는다 — 남기지 않으면 "돌았는데 건너뜀" 과
   * "프로세스가 죽어 안 돎" 이 DB 상 완전히 같아 보인다.
   */
  async recordSkippedStageRun(input: StageRunStart & { reason: string }): Promise<void> {
    await this.prisma.syncStateHistory.create({
      data: {
        job: input.job,
        batchJobHistoryId: input.batchJobHistoryId ?? null,
        provider: input.provider,
        stage: input.stage,
        detail: input.detail ?? null,
        source: input.source,
        status: BatchRunStatus.SKIPPED,
        skipReason: input.reason,
        startedAt: input.startedAt,
        finishedAt: input.startedAt,
        elapsedMs: 0,
      },
    });
  }
}

/**
 * 잡마다 모양이 다른 요약을 Prisma 의 JSON 입력으로 옮긴다.
 *
 * **직렬화를 한 번 거친다.** Date 나 BigInt 처럼 Prisma 가 JSON 열에 그대로 못 넣는 값이
 * 섞여 들어오면 적재가 통째로 실패한다 — 요약 때문에 회차 기록을 잃을 수는 없다.
 * undefined 는 그대로 돌려준다(Prisma 가 "이 열은 안 고침" 으로 읽는다).
 */
function toJson(value: unknown): LogPrisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as LogPrisma.InputJsonValue;
}
