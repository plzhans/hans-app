import { Injectable } from '@nestjs/common';
import { PrismaService, type JobQueue } from '@hansapp/data';

/**
 * 작업 큐 저장소. job_queue 테이블만 읽고 쓴다(메시지 브로커 대체품 — JobQueueService 주석 참고).
 *
 * DB 접근·쿼리 조립만 담당한다 — 반환은 Prisma 모델(job_queue) 그대로다. row→Job 매핑은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class JobQueueRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 요청을 넣는다. **같은 대상이 이미 있으면 그 행을 pending 으로 되돌린다** —
   * 100명이 같은 병원을 눌러도 큐에는 한 줄이다.
   *
   * 이미 pending 이면 그대로 둔다(created_at 이 밀리면 오래 기다린 요청이 뒤로 밀린다).
   */
  enqueue(tp: string, target: string): Promise<JobQueue> {
    return this.prisma.jobQueue.upsert({
      where: { tp_target: { tp, target } },
      create: { tp, target, status: 'pending' },
      update: { status: 'pending', error: null, processedAt: null },
    });
  }

  /** 대상 하나의 현재 행. 큐에 없으면 null. */
  find(tp: string, target: string): Promise<JobQueue | null> {
    return this.prisma.jobQueue.findUnique({
      where: { tp_target: { tp, target } },
    });
  }

  /**
   * 가장 오래 기다린 pending 하나를 집어 running 으로 바꾼다. 없거나 뺏기면 null.
   *
   * **updateMany 로 집는다.** findFirst 로 고르고 update 하면 그 사이에 다른 워커가 같은 행을
   * 집을 수 있다. status='pending' 조건을 UPDATE 에 넣어야 먼저 집은 쪽만 이긴다.
   * (지금은 CLI 1개라 경쟁이 없지만, 배치 서버가 붙는 순간 필요해진다.)
   */
  async claim(tp: string): Promise<JobQueue | null> {
    const next = await this.prisma.jobQueue.findFirst({
      where: { tp, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) {
      return null;
    }

    const { count } = await this.prisma.jobQueue.updateMany({
      where: { id: next.id, status: 'pending' },
      data: { status: 'running' },
    });
    if (count === 0) {
      return null; // 다른 워커가 먼저 집었다.
    }

    return { ...next, status: 'running' };
  }

  async succeed(id: number): Promise<void> {
    await this.prisma.jobQueue.update({
      where: { id },
      data: { status: 'done', error: null, processedAt: new Date() },
    });
  }

  async fail(id: number, error: string): Promise<void> {
    await this.prisma.jobQueue.update({
      where: { id },
      // 사유가 길 수 있다(HTML 응답 조각 등). 원인을 찾을 만큼만 남긴다.
      data: {
        status: 'failed',
        error: error.slice(0, 2_000),
        processedAt: new Date(),
      },
    });
  }

  countPending(tp: string): Promise<number> {
    return this.prisma.jobQueue.count({ where: { tp, status: 'pending' } });
  }
}
