import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * 공개 게시판 목록 캐시 키.
 *
 * **정본은 공개 계층이다**(packages/hansapp-application/src/community/board-read.service.ts
 * 의 BOARD_LIST_CACHE_KEY). 여기서 형식을 다시 적는 것은 관리자 계층이 그 계층을 의존하지
 * 않기 위해서다 — 그쪽이 바뀌면 이 파일도 같이 고쳐야 한다.
 *
 * 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */
const BOARD_LIST_KEY = 'board:list';

/**
 * 게시판이 바뀌면 공개 목록 캐시를 지운다.
 *
 * **TTL 이 한 시간인 것은 여기가 있기 때문이다.** 낡은 것이 저절로 털리기를 기다리는 것이
 * 아니라 바뀐 순간 지운다 — 게시판을 만들거나 이름을 고치면 포털 메뉴가 바로 따라온다.
 *
 * 목록은 통째로 한 덩어리라 무엇이 바뀌었든 지우는 키는 하나다.
 */
@Injectable()
export class BoardCacheInvalidator {
  private readonly logger = new Logger(BoardCacheInvalidator.name);

  constructor(
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * 지운다. **실패해도 던지지 않는다** — DB 는 이미 바뀌었고 캐시는 TTL 이 지나면 어차피
   * 맞춰진다. 여기서 예외를 내면 성공한 저장이 실패로 보인다.
   */
  async invalidateList(): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.del(BOARD_LIST_KEY);
    } catch (error) {
      this.logger.warn(`게시판 목록 캐시를 지우지 못했다: ${String(error)}`);
    }
  }
}
