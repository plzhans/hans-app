import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DomainEvent } from '@hansapp/event-contract';
import { EventPublisher } from '@hansapp/event-publisher';

/**
 * 내 정보 캐시 키. **정본은 인증 계층의 ProfileCache 다**(packages/hansapp-auth-application/
 * src/profile-cache.service.ts). 여기서 형식을 다시 적는 것은 관리자 계층이 그 계층을
 * 의존하지 않기 위해서다 — 그쪽이 바뀌면 이 파일도 같이 고쳐야 한다.
 * (글 캐시의 BoardPostCacheInvalidator 와 같은 방식이다.)
 *
 * 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */
const profileCacheKey = (userId: number) => `auth:profile:${userId}`;

/**
 * 캐시에 무엇이 들어 있나. **글 캐시(PostCacheState)와 같은 모양이다** — 콘솔이 같은
 * 패널로 보여 주므로, 한쪽만 다른 필드를 쓰면 화면을 두 벌 들고 있어야 한다.
 */
export interface ProfileCacheState {
  /** 환경 접두어(`develop:`)를 뺀 키. 붙이는 것은 CacheModule 이다. */
  readonly key: string;
  readonly hit: boolean;
  readonly expiresAt: Date | null;
  /** 남은 시간(ms). 만료 시각을 모르면 null. */
  readonly remainingMs: number | null;
  /** 담겨 있는 값 그대로. 화면이 JSON 으로 펴서 보여 준다. */
  readonly value: unknown;
  /**
   * 이 캐시가 프로세스 밖에서도 공유되나.
   *
   * **false 면 지금 보는 것은 이 프로세스의 메모리다** — 회원 API 가 다른 프로세스면
   * 그쪽이 들고 있는 것은 여기서 보이지도, 지워지지도 않는다.
   */
  readonly shared: boolean;
}

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
  async inspect(userId: number): Promise<ProfileCacheState> {
    const key = profileCacheKey(userId);
    const empty: ProfileCacheState = {
      key,
      hit: false,
      expiresAt: null,
      remainingMs: null,
      value: null,
      shared: false,
    };
    const store = this.cache?.stores?.[0];
    if (!store) return empty;

    try {
      const raw = (await store.get(key, { raw: true })) as {
        value?: unknown;
        expires?: number | null;
      } | null;
      if (!raw) return { ...empty, shared: isShared(store) };

      const expires = raw.expires ?? null;
      return {
        key,
        hit: true,
        expiresAt: expires === null ? null : new Date(expires),
        remainingMs:
          expires === null ? null : Math.max(0, expires - Date.now()),
        value: raw.value ?? null,
        shared: isShared(store),
      };
    } catch (error) {
      this.logger.warn(
        `내 정보 캐시를 읽지 못했다(userId=${userId}): ${String(error)}`,
      );
      return empty;
    }
  }

  /**
   * 지운다. **실패해도 던지지 않는다** — 캐시는 TTL 이 지나면 어차피 맞춰지고, 여기서
   * 예외를 내면 관리자 화면에 "초기화하지 못했습니다" 가 뜨는데 이벤트는 이미 나간 뒤다.
   */
  async purge(userId: number): Promise<void> {
    try {
      await this.cache?.del(profileCacheKey(userId));
    } catch (error) {
      this.logger.warn(
        `내 정보 캐시를 지우지 못했다(userId=${userId}): ${String(error)}`,
      );
    }
    // 각 인스턴스의 메모리 단은 이벤트를 받아 스스로 비운다.
    this.events.publish(DomainEvent.UserProfileUpdated, { userId });
    this.logger.log(`내 정보 캐시 초기화: userId=${userId}`);
  }
}

/**
 * Redis 처럼 프로세스 밖에 있는 저장소인가.
 *
 * Keyv 의 기본 저장소는 그냥 `Map` 이다 — 그것이면 이 프로세스 안에서만 사는 캐시다.
 */
function isShared(store: { opts?: { store?: unknown } }): boolean {
  return !(store.opts?.store instanceof Map);
}
