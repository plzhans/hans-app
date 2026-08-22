import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type SyncState } from '@hansapp/data';

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

  /**
   * 부팅 때 단계를 등록한다. 없으면 만들고, 있으면 **설명만** 고친다.
   *
   * **enabled 는 절대 건드리지 않는다.** 관리자가 콘솔에서 끈 값이라 재부팅으로 되살아나면
   * 안 된다(batch_job.register 가 status·enabled 를 피하는 것과 같은 이유). 반대로 설명은
   * 코드가 정본이라 매번 덮어쓴다.
   *
   * 실행 상태(status)는 새로 만들 때만 'idle' 로 둔다 — 이미 있는 행의 상태를 되돌리면
   * 프로세스를 올릴 때마다 이력이 끊긴다.
   */
  async register(key: string, provider: string, stage: number, description: string): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { job: key },
      create: { job: key, provider, stage, description, status: 'idle' },
      update: { description },
    });
  }

  /**
   * 단계를 켜고 끈다. 관리자 콘솔만 부른다.
   *
   * **upsert 다.** 한 번도 안 돌고 부팅 등록도 아직 안 된 단계를 끄는 경우가 있다 —
   * 한도 때문에 미리 꺼 두려는 상황이 정확히 그것이라, 행이 없다고 거절하면 뜻이 없다.
   */
  async setEnabled(key: string, provider: string, stage: number, enabled: boolean): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { job: key },
      create: { job: key, provider, stage, status: 'idle', enabled },
      update: { enabled },
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
