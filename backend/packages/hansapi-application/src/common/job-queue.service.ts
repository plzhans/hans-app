import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 요청을 넣는다. **같은 대상이 이미 있으면 그 행을 pending 으로 되돌린다** —
   * 100명이 같은 병원을 눌러도 큐에는 한 줄이다.
   *
   * 이미 pending 이면 그대로 둔다(created_at 이 밀리면 오래 기다린 요청이 뒤로 밀린다).
   */
  async enqueue(tp: string, target: string): Promise<Job> {
    const row = await this.prisma.job_queue.upsert({
      where: { tp_target: { tp, target } },
      create: { tp, target, status: 'pending' },
      update: { status: 'pending', error: null, processed_at: null },
    });
    return toJob(row);
  }

  /** 대상 하나의 현재 상태. 큐에 없으면 null. */
  async find(tp: string, target: string): Promise<Job | null> {
    const row = await this.prisma.job_queue.findUnique({
      where: { tp_target: { tp, target } },
    });
    return row ? toJob(row) : null;
  }

  /**
   * 가장 오래 기다린 pending 하나를 집어 running 으로 바꾼다. 없으면 null.
   *
   * **updateMany 로 집는다.** findFirst 로 고르고 update 하면 그 사이에 다른 워커가 같은 행을
   * 집을 수 있다. status='pending' 조건을 UPDATE 에 넣어야 먼저 집은 쪽만 이긴다.
   * (지금은 CLI 1개라 경쟁이 없지만, 배치 서버가 붙는 순간 필요해진다.)
   */
  async claim(tp: string): Promise<Job | null> {
    const next = await this.prisma.job_queue.findFirst({
      where: { tp, status: 'pending' },
      orderBy: { created_at: 'asc' },
    });
    if (!next) {
      return null;
    }

    const { count } = await this.prisma.job_queue.updateMany({
      where: { id: next.id, status: 'pending' },
      data: { status: 'running' },
    });
    if (count === 0) {
      return null; // 다른 워커가 먼저 집었다.
    }

    return toJob({ ...next, status: 'running' });
  }

  async succeed(id: number): Promise<void> {
    await this.prisma.job_queue.update({
      where: { id },
      data: { status: 'done', error: null, processed_at: new Date() },
    });
  }

  async fail(id: number, error: string): Promise<void> {
    await this.prisma.job_queue.update({
      where: { id },
      // 사유가 길 수 있다(HTML 응답 조각 등). 원인을 찾을 만큼만 남긴다.
      data: {
        status: 'failed',
        error: error.slice(0, 2_000),
        processed_at: new Date(),
      },
    });
  }

  async countPending(tp: string): Promise<number> {
    return this.prisma.job_queue.count({ where: { tp, status: 'pending' } });
  }
}

function toJob(row: {
  id: number;
  tp: string;
  target: string;
  status: string;
  error: string | null;
  created_at: Date;
  processed_at: Date | null;
}): Job {
  return {
    id: row.id,
    tp: row.tp,
    target: row.target,
    status: row.status as JobStatus,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    processedAt: row.processed_at ?? undefined,
  };
}
