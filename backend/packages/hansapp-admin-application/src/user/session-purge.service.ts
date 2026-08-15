import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import { UserSessionCacheAdmin } from './user-session-cache.admin';

/** 지운 결과. 화면이 "몇 명 / 몇 대" 로 보여 준다. */
export interface SessionPurgeResult {
  /** 지운 세션 수. */
  readonly sessions: number;
  /** 그 세션을 갖고 있던 회원 수. */
  readonly users: number;
  /** 지우지 못한 캐시 수. 0 이 아니면 그만큼은 만료까지 통과할 수 있다. */
  readonly cacheLeft: number;
}

/**
 * **모든 회원을 한 번에 로그아웃시킨다.**
 *
 * 평소에 쓸 기능이 아니다. 쓰는 자리는 정해져 있다 —
 *
 *  - 토큰 형식이나 서명 키를 바꿔 발급돼 있는 것이 의미를 잃었을 때
 *  - 유출이 의심돼 지금 살아 있는 세션을 전부 끊어야 할 때
 *
 * **개별 폐기를 회원 수만큼 부르지 않는다.** 그러면 회원마다 이벤트가 나가고 로그가 쌓여,
 * 정작 중요한 "몇 개를 끊었나" 가 묻힌다. 여기서는 한 번에 지우고 한 줄로 남긴다.
 *
 * **이벤트를 올리지 않는다.** 받는 쪽이 하는 일은 자기 메모리 캐시를 비우는 것인데, 이
 * 조치는 그 대상이 전부라 개별 알림이 의미가 없다. 공유 캐시(Redis)는 여기서 직접 지우고,
 * 각 인스턴스의 메모리는 캐시 상한(기본 1분)으로 빠진다 — 전원 재로그인을 시키는 조치에서
 * 1분은 감수할 만하다.
 */
@Injectable()
export class SessionPurgeService {
  private readonly logger = new Logger(SessionPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: UserSessionCacheAdmin,
  ) {}

  /** 지금 살아 있는 세션 수. 누르기 전에 규모를 보여 주려고 센다. */
  async count(): Promise<number> {
    return this.prisma.userTokenSession.count();
  }

  async purgeAll(): Promise<SessionPurgeResult> {
    /*
      **지우기 전에 목록을 받아 둔다.** 캐시 키가 (회원, 세션) 쌍이라 무엇을 지웠는지
      알아야 비울 수 있는데, 행을 지운 뒤에는 되물을 방법이 없다.
    */
    const rows = await this.prisma.userTokenSession.findMany({
      select: { sessionId: true, userId: true },
    });
    if (rows.length === 0) {
      return { sessions: 0, users: 0, cacheLeft: 0 };
    }

    await this.prisma.userTokenSession.deleteMany({});

    let cacheLeft = 0;
    for (const row of rows) {
      if (!(await this.cache.purge(row.userId, row.sessionId))) cacheLeft += 1;
    }

    const users = new Set(rows.map((row) => row.userId)).size;
    this.logger.warn(
      `Signed out all users: ${rows.length} sessions / ${users} users / ${cacheLeft} cache entries left`,
    );
    return { sessions: rows.length, users, cacheLeft };
  }
}
