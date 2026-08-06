import { Inject, Injectable, Logger } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { TokenSessionRepository } from './repository/token-session.repository';

/**
 * 계정당 살아 있는 세션 수를 상한 아래로 유지한다.
 *
 * **배치의 auth-cleanup 과 목적이 다르다.** 그쪽은 이미 **죽은** 줄(만료)을 치우고, 이쪽은
 * **살아 있는데 너무 많은** 경우를 막는다. 로그인마다 세션이 한 줄씩 생기는데 만료(refresh
 * TTL)까지는 살아 있어서, 쿠키를 자주 지우거나 기기가 많으면 기기 목록이 자기 것을 알아볼
 * 수 없을 만큼 길어진다.
 *
 * **부르는 자리는 응답 경로가 아니다.** 로그인 이벤트를 받은 처리기가 부른다 — 여기가 느려도
 * 사용자는 기다리지 않는다. 그래서 이 서비스는 자기가 언제 불리는지 모른다.
 */
@Injectable()
export class SessionTrimService {
  private readonly logger = new Logger(SessionTrimService.name);

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly sessions: TokenSessionRepository,
  ) {}

  async trim(userId: number): Promise<void> {
    const keep = this.config.maxSessionsPerUser;
    // 0 이하면 끈 것으로 본다. 설정으로 이 동작을 통째로 멈출 수 있어야 한다.
    if (keep <= 0) return;

    const removed = await this.sessions.trimToLimit(userId, keep);
    if (removed > 0) {
      this.logger.log(
        `세션 상한 정리 — userId=${userId} ${removed}건 (상한 ${keep})`,
      );
    }
  }
}
