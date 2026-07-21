import { Injectable } from '@nestjs/common';

import { JobQueueRepository } from './job-queue.repository';

/** 작업 종류. 지금은 하나뿐이다. */
export const JOB_NPAY_WEB = 'npay-web';

/** pending → running → done|failed. 재요청은 done|failed 를 pending 으로 되돌린다. */
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Job {
  id: number;
  tp: string;
  target: string;
  status: JobStatus;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
}

/**
 * 작업 큐. **메시지 브로커의 대체품이다** (job_queue 주석 참고).
 *
 * **이 계층에 있는 이유는 넣는 쪽과 꺼내는 쪽이 다르기 때문이다.** 서버는 요청을 넣고,
 * 배치(지금은 CLI)는 꺼내 처리한다. 둘 다 이 서비스를 쓰지만, 크롤 자체는 admin 계층에만 있다 —
 * 서버는 큐에 마킹만 하므로 외부를 호출하지 않는다.
 */
@Injectable()
export class JobQueueService {
  constructor(private readonly repo: JobQueueRepository) {}

  /**
   * 요청을 넣는다. **같은 대상이 이미 있으면 그 행을 pending 으로 되돌린다** —
   * 100명이 같은 병원을 눌러도 큐에는 한 줄이다.
   *
   * 이미 pending 이면 그대로 둔다(created_at 이 밀리면 오래 기다린 요청이 뒤로 밀린다).
   */
  async enqueue(tp: string, target: string): Promise<Job> {
    const row = await this.repo.enqueue(tp, target);
    return toJob(row);
  }

  /** 대상 하나의 현재 상태. 큐에 없으면 null. */
  async find(tp: string, target: string): Promise<Job | null> {
    const row = await this.repo.find(tp, target);
    return row ? toJob(row) : null;
  }

  /**
   * 가장 오래 기다린 pending 하나를 집어 running 으로 바꾼다. 없으면 null.
   *
   * 낙관적 락(집었는지 여부)은 repo 가 처리한다 — 여기서는 집은 행을 Job 으로 감싸기만 한다.
   */
  async claim(tp: string): Promise<Job | null> {
    const row = await this.repo.claim(tp);
    return row ? toJob(row) : null;
  }

  async succeed(id: number): Promise<void> {
    await this.repo.succeed(id);
  }

  async fail(id: number, error: string): Promise<void> {
    await this.repo.fail(id, error);
  }

  async countPending(tp: string): Promise<number> {
    return this.repo.countPending(tp);
  }
}

function toJob(row: {
  id: number;
  tp: string;
  target: string;
  status: string;
  error: string | null;
  createdAt: Date;
  processedAt: Date | null;
}): Job {
  return {
    id: row.id,
    tp: row.tp,
    target: row.target,
    status: row.status as JobStatus,
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    processedAt: row.processedAt ?? undefined,
  };
}
