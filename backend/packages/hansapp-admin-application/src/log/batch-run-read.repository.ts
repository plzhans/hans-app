import { Injectable } from '@nestjs/common';
import { LogPrisma, PrismaLogService } from '@hansapp/data';
import { BatchRunStatus } from '@hansapp/common';
import type { BatchJobHistory, SyncStateHistory } from '@hansapp/data';

/** 회차 이력 조회 조건. 비어 있는 값은 조건에서 빠진다. */
export interface BatchJobHistoryFilter {
  /** 잡 이름들. 분류로 거를 때도 코드가 category → job 목록을 풀어 여기로 넘긴다. */
  readonly jobs?: string[];
  /** 이 시각부터(포함) */
  readonly from?: Date;
  /** 이 시각까지(포함) */
  readonly to?: Date;
  /** 고른 상태들(BatchRunStatus). 비어 있으면 전부. */
  readonly statuses?: number[];
}

/**
 * 배치 실행 이력 조회 저장소. 로그 DB 를 읽는다.
 *
 * **적재는 BatchRunRepository 가 한다.** 읽기를 갈라 둔 이유는 llm-usage 와 같다 —
 * 적재는 실행 경로에 있어 절대 느려지면 안 되고, 조회는 필터·페이지네이션이 붙어 자란다.
 */
@Injectable()
export class BatchRunReadRepository {
  constructor(private readonly prisma: PrismaLogService) {}

  /**
   * 회차 이력 한 페이지와 총건수를 **한 번에** 가져온다.
   * 따로 부르면 그 사이에 새 회차가 쌓여 총건수와 행이 어긋난다.
   */
  listJobRuns(
    filter: BatchJobHistoryFilter,
    skip: number,
    take: number,
  ): Promise<[BatchJobHistory[], number]> {
    const where = buildWhere(filter);
    return this.prisma.$transaction([
      this.prisma.batchJobHistory.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.batchJobHistory.count({ where }),
    ]);
  }

  findJobRun(id: bigint): Promise<BatchJobHistory | null> {
    return this.prisma.batchJobHistory.findUnique({ where: { id } });
  }

  /**
   * 회차 번호 → 잡 이름만 뽑는다.
   *
   * **단계 이력은 자기가 어느 잡 것인지 모른다.** 속한 회차 번호만 들고 있어서,
   * 잡별로 묶으려면 이 되짚기가 필요하다. relation 을 안 걸어 뒀으므로(파티셔닝을 막는다)
   * 질의를 하나 더 내고 서비스가 잇는다.
   */
  findJobNames(ids: bigint[]): Promise<{ id: bigint; job: string }[]> {
    return this.prisma.batchJobHistory.findMany({
      where: { id: { in: ids } },
      select: { id: true, job: true },
    });
  }

  /**
   * 한 회차에 속한 단계들. 순서대로 준다.
   *
   * 페이지를 나누지 않는다 — 한 회차는 16단계뿐이라 통째로 주는 편이 화면에 낫다.
   */
  listStageRuns(batchJobHistoryId: bigint): Promise<SyncStateHistory[]> {
    return this.prisma.syncStateHistory.findMany({
      where: { batchJobHistoryId },
      orderBy: { startedAt: 'asc' },
    });
  }

  /**
   * 한 단계(job)의 이력. **회차를 가리지 않는다** — hanscli 로 단독 실행한 것도 함께 나온다.
   * "이 단계가 요즘 어떤가" 를 보는 자리다.
   */
  listStageRunsByJob(
    job: string,
    skip: number,
    take: number,
  ): Promise<[SyncStateHistory[], number]> {
    const where = { job };
    return this.prisma.$transaction([
      this.prisma.syncStateHistory.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.syncStateHistory.count({ where }),
    ]);
  }

  /**
   * 지금 돌고 있는 단계들. 화면의 "진행 중" 영역이 쓴다.
   *
   * **status 만 보고 시각은 안 본다.** 죽은 실행이 RUNNING 으로 남아 있을 수 있는데,
   * 그것도 보여야 하는 것이다 — 몇 시간째 RUNNING 인 줄이 곧 신호다.
   */
  listRunningStages(): Promise<SyncStateHistory[]> {
    return this.prisma.syncStateHistory.findMany({
      where: { status: BatchRunStatus.RUNNING },
      orderBy: { startedAt: 'asc' },
    });
  }
}

function buildWhere(filter: BatchJobHistoryFilter): LogPrisma.BatchJobHistoryWhereInput {
  const where: LogPrisma.BatchJobHistoryWhereInput = {};

  if (filter.jobs?.length) {
    where.job = { in: filter.jobs };
  }
  if (filter.from || filter.to) {
    where.startedAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  if (filter.statuses?.length) {
    where.status = { in: filter.statuses };
  }

  return where;
}
