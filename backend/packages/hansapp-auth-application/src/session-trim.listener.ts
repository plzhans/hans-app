import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DomainEvent,
  OnDomainEvent,
  type AuthLoginEvent,
} from '@hansapp/event-publisher';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { TokenSessionRepository } from './repository/token-session.repository';

/**
 * 로그인할 때마다 세션이 한 줄씩 생긴다. 상한을 넘으면 오래된 것부터 밀어낸다.
 *
 * **로그인 응답 경로에 있지 않다.** 이벤트를 받아 도는 자리라, 여기가 느려도 사용자가
 * 기다리지 않는다 — 그래서 발행부(LoginService)는 이 일이 있는지도 모른다.
 *
 * **만료 정리(배치의 auth-cleanup)와 목적이 다르다.** 그쪽은 이미 죽은 줄을 치우고, 이쪽은
 * **살아 있는데 너무 많은** 경우를 막는다. 쿠키를 자주 지우거나 기기가 많은 계정은 만료 전에도
 * 계속 늘어서, 기기 목록이 자기 것을 알아볼 수 없을 만큼 길어진다.
 *
 * **오래된 것부터 밀어낸다** — 방금 만든 세션이 지워지면 로그인하자마자 풀린다.
 * 기준은 마지막 활동(updatedAt)이라, 계속 쓰는 기기는 오래됐어도 남는다.
 */
@Injectable()
export class SessionTrimListener {
  private readonly logger = new Logger(SessionTrimListener.name);

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly sessions: TokenSessionRepository,
  ) {}

  @OnDomainEvent(DomainEvent.AuthLogin)
  async onLogin(event: AuthLoginEvent): Promise<void> {
    const keep = this.config.maxSessionsPerUser;
    // 0 이하면 끈 것으로 본다. 설정으로 이 동작을 통째로 멈출 수 있어야 한다.
    if (keep <= 0) return;

    try {
      const removed = await this.sessions.trimToLimit(event.userId, keep);
      if (removed > 0) {
        this.logger.log(
          `세션 상한 정리 — userId=${event.userId} ${removed}건 (상한 ${keep})`,
        );
      }
    } catch (error) {
      /*
        **던지지 않는다.** 로그인은 이미 끝났고 응답도 나갔다. 여기서 던져 봐야 받을 사람이
        없고, 상한을 못 지킨 것은 다음 로그인이나 배치가 만회한다.
      */
      this.logger.error(`세션 상한 정리 실패 — userId=${event.userId}`, error);
    }
  }
}
