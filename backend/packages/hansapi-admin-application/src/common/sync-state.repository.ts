import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type SyncState } from '@hansapi/data';

/**
 * 배치 단계 실행 상태(sync_state) 저장소. 조회·시작·성공/실패 기록·목록만 담당한다.
 *
 * 신선도·죽은 잠금·partial/done 판정 같은 규칙은 전부 서비스에 있다. 이 리포는 prisma 를 물려
 * **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다 — job 키는 서비스가 만들어 넘긴다.
 */
@Injectable()
export class SyncStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** job 키로 상태 한 건. 없으면 null. */
  find(key: string): Promise<SyncState | null> {
    return this.prisma.syncState.findUnique({ where: { job: key } });
  }

  /**
   * 실행 시작을 upsert 한다. 처음이면 만들고, 있으면 running 으로 되돌리며
   * 이전 실행의 마감/에러 흔적을 지운다(last_success_at 은 건드리지 않는다).
   */
  async start(key: string, provider: string, stage: number): Promise<void> {
    const base = {
      provider,
      stage,
      status: 'running',
      startedAt: new Date(),
      finishedAt: null,
      error: null,
    };

    await this.prisma.syncState.upsert({
      where: { job: key },
      create: { job: key, ...base },
      update: base,
    });
  }

  /** 상태 한 건을 갱신한다. 갱신할 필드는 서비스가 정해서 넘긴다(성공/실패 규칙은 거기 있다). */
  async update(key: string, data: Prisma.SyncStateUpdateInput): Promise<void> {
    await this.prisma.syncState.update({ where: { job: key }, data });
  }

  /** 전체 상태 조회 (CLI `sync status`). provider 로 좁힐 수 있다. */
  list(provider?: string) {
    return this.prisma.syncState.findMany({
      where: provider ? { provider } : {},
      orderBy: [{ provider: 'asc' }, { stage: 'asc' }, { job: 'asc' }],
    });
  }
}
