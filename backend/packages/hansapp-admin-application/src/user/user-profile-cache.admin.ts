import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DomainEvent } from '@hansapp/event-contract';
import { EventPublisher } from '@hansapp/event-publisher';

import { profileKey } from './auth-cache-keys';
import { inspectCacheEntry } from './cache-inspector';
import type { CacheEntryState } from './cache-inspector';

/** 내 정보 캐시의 상태. 모양은 다른 회원 캐시들과 같다(CacheEntryState). */
export type ProfileCacheState = CacheEntryState;

/**
 * 회원의 `/users/me` 응답 캐시를 들여다보고 지운다.
 *
 * **여기서 보이는 것은 공유 캐시(Redis)뿐이다.** 인증 계층은 그 앞에 프로세스 메모리를 한 단
 * 더 두는데, 그건 인스턴스마다 따로라 밖에서 셀 수 없다 — 지울 때 이벤트를 함께 올리는
 * 이유가 그것이다.
 */
@Injectable()
export class UserProfileCacheAdmin {
  private readonly logger = new Logger(UserProfileCacheAdmin.name);

  constructor(
    private readonly events: EventPublisher,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * 들여다본다. **지우기 전에 지울 것이 있는지 보라고 두는 창이다.**
   *
   * TTL 은 cache-manager 가 아니라 그 아래 Keyv 에게 직접 묻는다(`{ raw: true }`). 위쪽
   * API 는 값만 돌려주고 남은 시간을 알려주지 않는다(글 캐시와 같은 방식).
   */
  /** 들여다본다. **지우기 전에 지울 것이 있는지 보라고 두는 창이다.** */
  inspect(userId: number): Promise<ProfileCacheState> {
    return inspectCacheEntry(this.cache, profileKey(userId), (error) =>
      this.logger.warn(`Failed to read user profile cache (userId=${userId}): ${String(error)}`),
    );
  }

  /**
   * 지운다. **실패해도 던지지 않는다** — 캐시는 TTL 이 지나면 어차피 맞춰지고, 여기서
   * 예외를 내면 관리자 화면에 "초기화하지 못했습니다" 가 뜨는데 이벤트는 이미 나간 뒤다.
   */
  async purge(userId: number): Promise<void> {
    try {
      await this.cache?.del(profileKey(userId));
    } catch (error) {
      this.logger.warn(`Failed to evict user profile cache (userId=${userId}): ${String(error)}`);
    }
    // 각 인스턴스의 메모리 단은 이벤트를 받아 스스로 비운다.
    this.events.publish(DomainEvent.UserProfileUpdated, { userId });
    this.logger.log(`User profile cache cleared: userId=${userId}`);
  }
}
