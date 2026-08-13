import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';
import { UserSessionCacheAdmin, type CachedSession } from '@hansapp/admin-application';

/** DB 에 한 번에 물어볼 sid 수. IN 목록이 너무 길면 쿼리 계획이 나빠진다. */
const LOOKUP_CHUNK = 200;

/**
 * 주인 없는 세션 캐시를 지운다.
 *
 * **왜 생기나.** 세션을 끊을 때 DB 행을 먼저 지우고 캐시를 지우는데, 그 뒤 캐시 삭제가
 * 실패할 수 있다(Redis 순간 장애 등). DB 는 이미 바뀌었으니 조치를 실패로 되돌릴 수는
 * 없고, 그러면 **행은 없는데 캐시만 남은 항목**이 생긴다. 폐기 경로가 재시도·확인까지
 * 하지만 그래도 새는 경우가 있어, 마지막 그물을 여기 둔다.
 *
 * **그냥 두면 위험하다.** 그 캐시에 담긴 것은 세션의 만료 시각이고 가드는 그걸 보고
 * 통과시킨다 — 끊은 기기가 캐시가 만료될 때까지 계속 통한다. 다른 캐시가 낡는 것과
 * 무게가 다르다.
 *
 * **훑는 일은 관리자 계층이 한다**(UserSessionCacheAdmin.scanAll). 관리자 화면도 같은
 * 목록을 쓰기 때문이다 — 여기서 따로 훑으면 SCAN 을 다루는 코드가 두 벌이 된다.
 */
@Injectable()
export class SessionCacheSweeper {
  private readonly logger = new Logger(SessionCacheSweeper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: UserSessionCacheAdmin,
  ) {}

  async run(): Promise<void> {
    const cached = await this.cache.scanAll();
    if (cached.length === 0) {
      // 캐시가 비었거나 Redis 를 안 쓰는 환경(로컬 폴백)이다. 후자는 고아가 생기지 않는다.
      this.logger.log('세션 캐시 정리 — 훑을 항목 없음');
      return;
    }

    let removed = 0;
    for (let i = 0; i < cached.length; i += LOOKUP_CHUNK) {
      const chunk = cached.slice(i, i + LOOKUP_CHUNK);
      try {
        removed += await this.sweepChunk(chunk);
      } catch (error) {
        // 한 묶음이 실패해도 나머지는 계속 본다. 놓친 것은 다음 회차가 잡는다.
        this.logger.error('세션 캐시 정리 중 오류', error);
      }
    }

    this.logger.log(`세션 캐시 정리 — ${cached.length}건 확인 / ${removed}건 삭제`);
  }

  /**
   * DB 에 없는 캐시를 지운다.
   *
   * **회원까지 맞는지 본다.** 키에 회원번호가 박혀 있으므로, 행은 있는데 주인이 다른
   * 키는 정상 흐름에 없는 것이다 — 그것도 치운다.
   */
  private async sweepChunk(entries: CachedSession[]): Promise<number> {
    const rows = await this.prisma.userTokenSession.findMany({
      where: { sessionId: { in: entries.map((entry) => entry.sessionId) } },
      select: { sessionId: true, userId: true },
    });
    const owner = new Map(rows.map((row) => [row.sessionId, row.userId]));

    let removed = 0;
    for (const entry of entries) {
      if (owner.get(entry.sessionId) === entry.userId) continue;
      await this.cache.purge(entry.userId, entry.sessionId);
      removed += 1;
    }
    return removed;
  }
}
