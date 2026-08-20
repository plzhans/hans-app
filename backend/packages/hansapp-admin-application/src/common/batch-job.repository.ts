import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type BatchJob } from '@hansapp/data';

/** 부팅 때 코드가 실어 넣는 거울값 */
export interface BatchJobRegistration {
  readonly job: string;
  readonly description: string;
  /** BatchCategory 의 이름 */
  readonly category: string;
  readonly cronExpression: string;
  readonly timeZone: string;
  readonly nextRunAt?: Date;
}

/**
 * 잡 마스터(batch_job) 저장소. 메인 DB 를 본다.
 *
 * sync-state.repository 와 같은 자리의 얇은 경계다 — 규칙(연속 실패 세기, 성공 시각을
 * 언제 갱신하나)은 전부 서비스에 있고, 여기는 prisma 만 물린다.
 */
@Injectable()
export class BatchJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 등록된 잡을 upsert 한다. 부팅 때마다 돈다.
   *
   * **실행 상태와 enabled 는 건드리지 않는다.** 재시작이 마지막 성공 시각이나 연속 실패
   * 횟수를 지우면 프로세스를 한 번 올릴 때마다 "방금 잘 돈 것" 처럼 보인다. enabled 는
   * 더 중요하다 — 관리자가 끈 잡이 재부팅으로 되살아나면 끈 의미가 없다.
   */
  async register(input: BatchJobRegistration): Promise<void> {
    const mirror = {
      description: input.description,
      category: input.category,
      cronExpression: input.cronExpression,
      timeZone: input.timeZone,
      /*
        **다음 실행 시각은 줬을 때만 고친다.** 크론을 등록한 프로세스만 이 값을 안다 —
        일회 실행(--once·--job)이 null 로 덮으면 상주 프로세스가 써둔 예정이 사라지고,
        콘솔이 "예정 없음" 으로 보인다.
      */
      ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}),
    };

    await this.prisma.batchJob.upsert({
      where: { job: input.job },
      // 처음 보는 잡이다. 아직 한 번도 안 돌았다는 뜻으로 IDLE 로 연다.
      create: { job: input.job, status: 'IDLE', ...mirror },
      update: mirror,
    });
  }

  /**
   * 스케줄 on/off 를 바꾸고, 바뀐 뒤의 행을 돌려준다.
   *
   * **이 표에서 유일하게 관리자가 쓰는 값이다.** 나머지는 배치가 부팅·실행 때 쓰는 거울이다.
   */
  setEnabled(job: string, enabled: boolean): Promise<BatchJob> {
    return this.prisma.batchJob.update({ where: { job }, data: { enabled } });
  }

  find(job: string): Promise<BatchJob | null> {
    return this.prisma.batchJob.findUnique({ where: { job } });
  }

  async update(job: string, data: Prisma.BatchJobUpdateInput): Promise<void> {
    await this.prisma.batchJob.update({ where: { job }, data });
  }

  /**
   * 등록되지 않은 잡을 지운다. 부팅 때 등록을 마친 뒤 한 번 돈다.
   *
   * **안 지우면 없어진 잡이 영원히 경보를 띄운다.** next_run_at 이 과거에 멈춘 채 남아
   * "예정 시각이 지났는데 안 돌았다" 로 계속 뜨는데, 그 잡은 애초에 없다.
   * 거짓 경보가 섞이면 진짜 경보를 안 믿게 된다.
   *
   * **이력은 안 지운다.** 그쪽은 로그 DB 에 잡 이름만 값으로 들고 있어서, 마스터가
   * 사라져도 "예전에 이런 잡이 이렇게 돌았다" 는 그대로 남는다 — 그게 이력의 목적이다.
   */
  async pruneExcept(names: readonly string[]): Promise<string[]> {
    const stale = await this.prisma.batchJob.findMany({
      where: { job: { notIn: [...names] } },
      select: { job: true },
    });
    if (stale.length === 0) {
      return [];
    }

    await this.prisma.batchJob.deleteMany({ where: { job: { notIn: [...names] } } });
    return stale.map((row) => row.job);
  }

  /** 전체 현황. 콘솔이 분류로 묶어 보여준다. */
  list(): Promise<BatchJob[]> {
    return this.prisma.batchJob.findMany({ orderBy: [{ category: 'asc' }, { job: 'asc' }] });
  }
}
