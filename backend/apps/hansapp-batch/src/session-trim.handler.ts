import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import { DomainEvent, type AuthLoginEvent } from '@hansapp/event-contract';
import { OnDomainEvent } from '@hansapp/event-consumer';

/**
 * 로그인할 때마다 세션이 한 줄씩 생긴다. 상한을 넘으면 오래된 것부터 밀어낸다.
 *
 * **API 응답 경로에 없다.** API 는 "로그인했다" 를 큐에 넣고 바로 응답한다. 이 처리는 다른
 * 프로세스에서 돌아서, 여기가 느리거나 실패해도 사용자는 기다리지 않는다.
 *
 * **배치의 auth-cleanup 과 목적이 다르다.** 그쪽은 이미 **죽은** 줄(만료)을 치우고, 이쪽은
 * **살아 있는데 너무 많은** 경우를 막는다. 쿠키를 자주 지우거나 기기가 많으면 만료 전에도
 * 계속 늘어서, 기기 목록이 자기 것을 알아볼 수 없을 만큼 길어진다.
 *
 * **오래된 것부터 밀어낸다** — 방금 만든 세션이 지워지면 로그인하자마자 풀린다. 기준은
 * 마지막 활동(updatedAt)이라 계속 쓰는 기기는 오래됐어도 남는다.
 *
 * Prisma 를 직접 쓴다. 인증 패키지를 가져오면 소셜 로그인 전략(passport)까지 딸려 오는데,
 * 한 테이블을 손보는 처리에 그건 과하다(AuthCleanupService 와 같은 이유).
 */
@Injectable()
export class SessionTrimHandler {
  private readonly logger = new Logger(SessionTrimHandler.name);

  /** 계정당 남길 세션 수. */
  private readonly keep = 10;

  constructor(private readonly prisma: PrismaService) {}

  @OnDomainEvent(DomainEvent.AuthLogin)
  async onLogin(event: AuthLoginEvent): Promise<void> {
    /*
      **목록을 다 가져오지 않는다.** 남길 경계(keep 번째로 최근인 세션의 시각)만 한 줄로 찾고,
      그보다 오래된 것을 지운다. (user_id) 인덱스가 있어 그 계정의 행만 본다.
    */
    const boundary = await this.prisma.userTokenSession.findMany({
      where: { userId: event.userId },
      orderBy: { updatedAt: 'desc' },
      skip: this.keep - 1,
      take: 1,
      select: { updatedAt: true },
    });
    if (boundary.length === 0) return;

    const { count } = await this.prisma.userTokenSession.deleteMany({
      where: {
        userId: event.userId,
        updatedAt: { lt: boundary[0].updatedAt },
      },
    });
    if (count > 0) {
      this.logger.log(
        `세션 상한 정리 — userId=${event.userId} ${count}건 (상한 ${this.keep})`,
      );
    }
  }
}
