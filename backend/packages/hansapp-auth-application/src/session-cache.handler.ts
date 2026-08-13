import { Injectable } from '@nestjs/common';
import {
  DomainEvent,
  type AuthSessionRevokedEvent,
} from '@hansapp/event-contract';
import { OnDomainEvent } from '@hansapp/event-consumer';

import { SessionCache } from './session-cache.service';

/**
 * 세션 폐기 이벤트 → 세션 캐시 비우기.
 *
 * **관리자 콘솔은 캐시를 모른다.** 그쪽은 DB 행을 지우고 "이 세션들이 폐기됐다" 만 알린다 —
 * 캐시는 이 계층이 소유하므로 키 모양도 여기서만 안다. 콘솔이 Redis 를 직접 건드리게 하면
 * 키 규칙이 두 서비스에 복사되어, 한쪽만 바뀌는 날 조용히 어긋난다.
 *
 * **지금은 한 대만 받는다.** 전달이 BullMQ(작업 큐)라 잡 하나를 워커 하나가 가져간다.
 * Redis 는 공유라 그 한 대가 지우면 끝이고, 남는 것은 다른 인스턴스의 **메모리**뿐이다 —
 * 그건 캐시 TTL(기본 60초)로 사라진다. 소비를 컨슈머 그룹으로 바꾸면 전부가 받아 그
 * 60초도 없어지는데, **이 파일은 그대로다** — 바뀌는 것은 전달 계층뿐이다.
 *
 * **이벤트가 유실돼도 최악이 TTL 이다.** 그래서 메모리와 Redis TTL 을 같은 값으로 둔다
 * (auth.config 의 SessionCacheConfig 주석 참고).
 */
@Injectable()
export class SessionCacheHandler {
  constructor(private readonly cache: SessionCache) {}

  @OnDomainEvent(DomainEvent.AuthSessionRevoked)
  onRevoked(event: AuthSessionRevokedEvent): Promise<void> {
    return this.cache.invalidate(event.sessionIds);
  }
}
