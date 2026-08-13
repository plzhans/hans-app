import { Injectable } from '@nestjs/common';
import { AppStatus, PrismaService } from '@hansapp/data';
import type { App } from '@hansapp/data';

/**
 * 앱에 매달린 발급물의 참조. **상태를 바꾸기 전에 읽어 둬야 한다** — 바꾼 뒤에는 이번에
 * 무엇이 움직였는지 가려낼 수 없다. 인증 캐시를 어떤 키로 비울지 정하는 값이다.
 */
export interface IssuedRefs {
  readonly apiKeyIds: number[];
  /** 공개 clientId. 캐시가 내부 pk 가 아니라 이 값으로 걸려 있다. */
  readonly clientIds: string[];
}

/**
 * 앱 관리 조치(승인·거절·차단) 저장소.
 *
 * 조회 저장소(AppReadRepository)와 갈라 둔다 — 읽기 전용이라는 성질을 지키고, 앱을 건드리는
 * 쓰기가 어디에 있는지를 파일 이름으로 드러낸다.
 */
@Injectable()
export class AppModerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 조치 대상 앱 한 건. **삭제된 앱은 대상이 아니라 제외한다.** */
  findLive(appId: number): Promise<App | null> {
    return this.prisma.app.findFirst({ where: { id: appId, deletedAt: null } });
  }

  /** 지정한 상태의 서비스 키·클라이언트. 이번 조치로 움직일 것들을 미리 집는 데 쓴다. */
  async findIssued(appId: number, statuses: AppStatus[]): Promise<IssuedRefs> {
    const status = { in: statuses };
    const [keys, clients] = await Promise.all([
      this.prisma.appApiKey.findMany({
        where: { appId, status },
        select: { id: true },
      }),
      this.prisma.appClient.findMany({
        where: { appId, status },
        select: { clientId: true },
      }),
    ]);
    return {
      apiKeyIds: keys.map((k) => k.id),
      clientIds: clients.map((c) => c.clientId),
    };
  }

  /**
   * 승인: 앱과 그 하위 **PENDING** 키·클라이언트를 ACTIVE 로 올린다(트랜잭션).
   * DISABLED 는 건드리지 않는다 — 사용자가 끈 것을 승인이 되살리면 안 된다.
   */
  approve(appId: number): Promise<void> {
    return this.setStatus(appId, AppStatus.ACTIVE, [AppStatus.PENDING], {
      // 승인되면 거절 사유는 무의미하므로 함께 정리한다.
      rejectionReason: null,
    });
  }

  /**
   * 차단: 앱과 **아직 살아 있는** 키·클라이언트를 전부 DISABLED 로 내린다(트랜잭션).
   *
   * 하위까지 내리는 것이 핵심이다 — 인증은 앱이 아니라 키·클라이언트의 status 를 보므로,
   * 앱만 내리면 API 호출이 그대로 통과한다.
   */
  block(appId: number): Promise<void> {
    return this.setStatus(appId, AppStatus.DISABLED, [AppStatus.PENDING, AppStatus.ACTIVE]);
  }

  /** 차단 해제: 앱과 그 하위 DISABLED 키·클라이언트를 ACTIVE 로 되돌린다(트랜잭션). */
  unblock(appId: number): Promise<void> {
    return this.setStatus(appId, AppStatus.ACTIVE, [AppStatus.DISABLED]);
  }

  /**
   * 거절: 사유를 남긴다. status 는 PENDING 그대로다(사용자가 고쳐 재요청한다).
   * reviewRequestedAt 도 그대로 둔다 — 마지막으로 언제 요청했는지는 남아야 한다.
   */
  reject(appId: number, reason: string): Promise<void> {
    return this.prisma.app
      .update({ where: { id: appId }, data: { rejectionReason: reason } })
      .then(() => undefined);
  }

  /**
   * 앱과 그 하위 발급물의 상태를 한 트랜잭션으로 옮긴다.
   *
   * **하위는 `from` 에 든 상태만 옮긴다.** 통째로 덮으면 사용자가 따로 꺼 둔 것까지
   * 되살아나 사용자 의도를 덮어쓴다(app.prisma 의 AppStatus 주석 참고).
   */
  private setStatus(
    appId: number,
    to: AppStatus,
    from: AppStatus[],
    appExtra: { rejectionReason?: null } = {},
  ): Promise<void> {
    return this.prisma
      .$transaction(async (tx) => {
        await tx.app.update({
          where: { id: appId },
          data: { status: to, ...appExtra },
        });
        const where = { appId, status: { in: from } };
        await tx.appApiKey.updateMany({ where, data: { status: to } });
        await tx.appClient.updateMany({ where, data: { status: to } });
      })
      .then(() => undefined);
  }
}
