import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * 글 상세 캐시 키. **정본은 공개 계층의 BoardReadService 다**(packages/hansapp-application/
 * src/community/board-read.service.ts 의 boardPostCacheKey). 여기서 형식을 다시 적는 것은
 * 관리자 계층이 그 계층을 의존하지 않기 위해서다 — 그쪽이 바뀌면 이 파일도 같이 고쳐야 한다.
 * (앱 심사의 AccessCacheInvalidator 와 같은 방식이다.)
 *
 * 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */
const postCacheKey = (boardName: string, postId: number) => `board:post:${boardName}:${postId}`;

/** 캐시에 무엇이 들어 있나. 콘솔의 캐싱 탭이 이걸 그대로 보여 준다. */
export interface PostCacheState {
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
   * **false 면 지금 보는 것은 이 프로세스의 메모리다** — 공개 API 가 다른 프로세스면
   * 그쪽이 들고 있는 것은 여기서 보이지도, 지워지지도 않는다.
   */
  readonly shared: boolean;
}

/**
 * 글이 바뀌면 그 글의 캐시를 지운다. 무엇이 들어 있는지도 여기서 들여다본다.
 *
 * **TTL 이 한 시간인 것은 여기가 있기 때문이다.** 시간이 지나 낡은 것이 저절로 털리기를
 * 기다리는 것이 아니라, 바뀐 순간 지운다 — 그래서 공개 화면이 고친 글을 바로 보여준다.
 *
 * **다른 프로세스의 메모리 캐시까지는 못 지운다.** 공유되는 것은 Redis 뿐이라, 공개 API 가
 * 메모리 단을 함께 쓰면 그만큼 늦게 반영된다(지금 게시판 캐시는 Redis 만 쓴다).
 * REDIS_URL 이 없는 환경에서는 인메모리로 폴백돼 이 삭제가 사실상 무의미해지지만,
 * 그런 환경은 프로세스도 캐시도 분리돼 있지 않다.
 */
@Injectable()
export class BoardPostCacheInvalidator {
  private readonly logger = new Logger(BoardPostCacheInvalidator.name);

  constructor(@Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache) {}

  /**
   * 지운다. **실패해도 던지지 않는다** — DB 는 이미 바뀌었고, 캐시는 TTL 이 지나면 어차피
   * 맞춰진다. 여기서 예외를 내면 성공한 저장이 실패로 보인다.
   */
  async invalidate(boardName: string, postId: number): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.del(postCacheKey(boardName, postId));
    } catch (error) {
      this.logger.warn(`글 캐시를 지우지 못했다(${boardName}/${postId}): ${String(error)}`);
    }
  }

  /**
   * 들여다본다. **지우기 전에 지울 것이 있는지 보라고 두는 창이다.**
   *
   * 값만이 아니라 언제 만료되는지까지 준다 — "캐시를 지웠는데 아직 옛 글이 보인다" 는
   * 상황에서 알아야 하는 것은 값이 아니라 그 값이 언제까지 살아 있느냐다.
   *
   * TTL 은 cache-manager 가 아니라 그 아래 Keyv 에게 직접 묻는다(`{ raw: true }`). 위쪽
   * API 는 값만 돌려주고 남은 시간을 알려주지 않는다.
   */
  async inspect(boardName: string, postId: number): Promise<PostCacheState> {
    const key = postCacheKey(boardName, postId);
    const empty: PostCacheState = {
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
        remainingMs: expires === null ? null : Math.max(0, expires - Date.now()),
        value: raw.value ?? null,
        shared: isShared(store),
      };
    } catch (error) {
      this.logger.warn(`글 캐시를 읽지 못했다(${boardName}/${postId}): ${String(error)}`);
      return empty;
    }
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
