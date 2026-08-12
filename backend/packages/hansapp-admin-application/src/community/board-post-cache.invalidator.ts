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
const postCacheKey = (boardName: string, postId: number) =>
  `board:post:${boardName}:${postId}`;

/**
 * 글이 바뀌면 그 글의 캐시를 지운다.
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

  constructor(
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * 지운다. **실패해도 던지지 않는다** — DB 는 이미 바뀌었고, 캐시는 TTL 이 지나면 어차피
   * 맞춰진다. 여기서 예외를 내면 성공한 저장이 실패로 보인다.
   */
  async invalidate(boardName: string, postId: number): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.del(postCacheKey(boardName, postId));
    } catch (error) {
      this.logger.warn(
        `글 캐시를 지우지 못했다(${boardName}/${postId}): ${String(error)}`,
      );
    }
  }
}
