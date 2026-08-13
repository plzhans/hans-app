import { Injectable, Logger } from '@nestjs/common';

import { AdminSessionCache } from './admin-session-cache.service';
import { AdminSessionRepository } from './admin-session.repository';

/** 지운 결과. 화면이 "몇 명 / 몇 대" 로 보여 준다. */
export interface AdminSessionPurgeResult {
  /** 지운 세션 수. */
  readonly sessions: number;
  /** 그 세션을 갖고 있던 관리자 수. */
  readonly admins: number;
  /** 지우지 못한 캐시 수. 0 이 아니면 그만큼은 만료까지 통과할 수 있다. */
  readonly cacheLeft: number;
}

/**
 * **모든 관리자를 한 번에 로그아웃시킨다.** 회원 쪽(SessionPurgeService)의 관리자판이다.
 *
 * 평소에 쓸 기능이 아니다. 쓰는 자리는 정해져 있다 —
 *
 *  - 토큰 형식이나 서명 키를 바꿔 발급돼 있는 것이 의미를 잃었을 때
 *  - 유출이 의심돼 지금 살아 있는 세션을 전부 끊어야 할 때
 *
 * **누른 사람도 함께 나간다.** 관리자 세션에는 예외가 없다 — 자기 세션만 남기면 "전부
 * 끊었다" 가 거짓이 되고, 유출 대응이라는 쓰임에서 그 한 자리가 가장 위험할 수도 있다.
 * 화면이 그 사실을 미리 말한다.
 *
 * **개별 폐기를 관리자 수만큼 부르지 않는다.** 한 번에 지우고 한 줄로 남긴다 — 그래야
 * "몇 개를 끊었나" 가 로그에서 묻히지 않는다.
 */
@Injectable()
export class AdminSessionPurgeService {
  private readonly logger = new Logger(AdminSessionPurgeService.name);

  constructor(
    private readonly sessions: AdminSessionRepository,
    private readonly cache: AdminSessionCache,
  ) {}

  /** 지금 있는 세션 수. 누르기 전에 규모를 보여 주려고 센다. */
  count(): Promise<number> {
    return this.sessions.countAll();
  }

  async purgeAll(): Promise<AdminSessionPurgeResult> {
    const rows = await this.sessions.deleteAllSessions();
    if (rows.length === 0) {
      return { sessions: 0, admins: 0, cacheLeft: 0 };
    }

    /*
      **캐시까지 지워야 실제로 막힌다.** 가드가 요청마다 보는 것이 그 칸이라, 행만 지우면
      끊긴 세션이 캐시가 만료될 때까지 그대로 통과한다.
    */
    let cacheLeft = 0;
    for (const row of rows) {
      if (!(await this.cache.purge(row.adminId, row.sessionId))) cacheLeft += 1;
    }

    const admins = new Set(rows.map((row) => row.adminId)).size;
    this.logger.warn(
      `관리자 전체 로그아웃 — 세션 ${rows.length}개 / 관리자 ${admins}명 / 캐시 잔여 ${cacheLeft}건`,
    );
    return { sessions: rows.length, admins, cacheLeft };
  }
}
