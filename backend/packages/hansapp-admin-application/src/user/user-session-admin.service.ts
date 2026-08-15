import { Injectable, Logger } from '@nestjs/common';
import { UnavailableError } from '@hansapp/common';
import { AdminErrorCode } from '../error';
import { DomainEvent } from '@hansapp/event-contract';
import { EventPublisher } from '@hansapp/event-publisher';

import { UserSessionAdminRepository } from './user-session-admin.repository';
import { UserSessionCacheAdmin } from './user-session-cache.admin';

/**
 * 관리자에 의한 로그인 세션 폐기.
 *
 * **회원 통로에서 유일한 쓰기다.** 조회는 전부 읽기 전용인데 이것만 예외인 이유는, 계정
 * 도용이 의심될 때 회원 본인이 손쓰기 전에 끊어야 하는 경우가 있어서다.
 *
 * **캐시는 이 계층이 모른다.** DB 행을 지우고 "폐기됐다" 는 이벤트만 올린다 — 세션 캐시를
 * 소유한 것은 인증 계층(hansapp-api)이고, 키 모양도 그쪽만 안다. 여기서 Redis 를 직접
 * 건드리면 키 규칙이 두 서비스에 복사되어 한쪽만 바뀌는 날 조용히 어긋난다.
 *
 * **반영은 즉시가 아니다.** 이벤트가 닿기까지, 그리고 닿지 못하면 캐시 TTL(기본 60초)까지
 * 그 토큰이 통한다. 지금 전달이 작업 큐라 인스턴스 한 대만 받는 것도 같은 이유로 괜찮다 —
 * 나머지는 TTL 로 만료된다. 소비를 컨슈머 그룹으로 바꾸면 이 지연이 사라진다.
 */
@Injectable()
export class UserSessionAdminService {
  private readonly logger = new Logger(UserSessionAdminService.name);

  constructor(
    private readonly repo: UserSessionAdminRepository,
    private readonly cache: UserSessionCacheAdmin,
    private readonly events: EventPublisher,
  ) {}

  /** 기기 한 대를 끊는다. 그 회원의 세션이 아니면 아무것도 지우지 않는다(빈 배열). */
  async revokeOne(userId: number, sessionId: number): Promise<number[]> {
    const removed = await this.repo.deleteOne(userId, sessionId);
    await this.announce(userId, removed);
    return removed;
  }

  /** 이 회원의 모든 기기를 끊는다. */
  async revokeAll(userId: number): Promise<number[]> {
    const removed = await this.repo.deleteAll(userId);
    await this.announce(userId, removed);
    return removed;
  }

  /**
   * 폐기를 알린다. **공유 캐시는 여기서 직접 지운다.**
   *
   * 이벤트에만 맡기면 큐가 죽었을 때 폐기된 세션이 Redis 상한(기본 1시간)만큼 그대로
   * 통과한다 — 끊는 것이 목적인 조치라 그 창을 큐 사정에 걸어 둘 수 없다. 각 인스턴스의
   * 메모리 단은 밖에서 손댈 수 없으니 그것만 이벤트로 알린다.
   */
  private async announce(userId: number, sessionIds: number[]): Promise<void> {
    // 지운 게 없으면 알릴 것도 없다. 빈 이벤트는 받는 쪽에서 헛도는 잡이 된다.
    if (sessionIds.length === 0) return;

    const left: number[] = [];
    for (const sessionId of sessionIds) {
      if (!(await this.cache.purge(userId, sessionId))) left.push(sessionId);
    }

    this.events.publish(DomainEvent.AuthSessionRevoked, { userId, sessionIds });
    this.logger.log(`Sessions revoked: userId=${userId} count=${sessionIds.length}`);

    /*
      **캐시가 남았으면 알린다.** DB 행은 이미 지워졌으니 되돌릴 것은 없지만, 조치가
      의도한 결과(그 기기가 막힘)에 이르지 못했다 — 조용히 204 를 주면 관리자는 끊긴 줄
      안다. 다시 눌러 재시도할 수 있고(삭제는 멱등이다), 그대로 둬도 배치가 치운다.
    */
    if (left.length > 0) {
      throw new UnavailableError(AdminErrorCode.ADMIN_USER_CACHE_PARTIALLY_CLEARED);
    }
  }
}
