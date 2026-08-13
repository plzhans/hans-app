import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { SESSION_CACHE_CONFIG } from './auth.config';
import type { SessionCacheConfig } from './auth.config';
import { TokenSessionRepository } from './repository/token-session.repository';
import { TwoTierCache } from './two-tier-cache';

/** 캐시 키 접두사. 하나의 Redis 를 여러 도메인이 공유하므로 auth 네임스페이스로 격리한다. */
const PREFIX = 'auth:session';

/**
 * 로그인 세션 캐시. **access token 을 매 요청 세션과 대조하기 위한 것이다.**
 *
 * access token 은 서명만으로 검증되는 JWT 라, 그것만 보면 관리자가 세션을 끊어도 만료(기본
 * 1시간)까지 계속 통한다. 그렇다고 요청마다 DB 를 볼 수는 없어서 이 캐시를 사이에 둔다 —
 * 서명 검증은 늘 하고, 그 뒤 sid 로 여기를 한 번 본다.
 *
 * **키는 sid 다. 토큰이 아니다.** 폐기의 단위가 세션이라 그렇다 — 토큰으로 캐싱하면 관리자가
 * 지울 키를 알 수 없고(발급된 토큰 문자열을 모른다), rotate 마다 키가 새로 생겨 계속 불어난다.
 * 토큰 원문이 Redis 에 앉는 것도 그 자체로 자격증명을 한 벌 더 두는 일이다.
 *
 * 캐시에 담는 값은 **만료 시각(epoch ms)** 이다. Date 를 넣으면 Redis 를 거치며 문자열이 된다.
 */
@Injectable()
export class SessionCache {
  private readonly cache: TwoTierCache<number>;

  constructor(
    private readonly sessions: TokenSessionRepository,
    @Inject(SESSION_CACHE_CONFIG) config: SessionCacheConfig,
    @Optional() @Inject(CACHE_MANAGER) shared?: Cache,
  ) {
    this.cache = new TwoTierCache(config, shared, new Logger(SessionCache.name));
  }

  /**
   * 이 세션이 아직 살아 있나. 가드가 요청마다 부른다.
   *
   * **만료는 캐시된 값으로 판단하되, 지났으면 원천을 다시 본다.** 캐시에 담긴 만료 시각은
   * rotate 로 연장되기 전 값일 수 있어서, 그대로 믿고 거절하면 멀쩡히 쓰고 있는 세션이
   * 튕긴다. 지난 것처럼 보일 때만 한 번 더 확인하므로 비용은 만료 언저리에서만 든다.
   */
  async isLive(sessionId: string): Promise<boolean> {
    const cached = await this.read(sessionId);
    if (cached === null) return false;
    if (cached > Date.now()) return true;

    await this.cache.drop(keyOf(sessionId));
    const fresh = await this.read(sessionId);
    return fresh !== null && fresh > Date.now();
  }

  /** 폐기된 세션을 캐시에서 지운다. */
  async invalidate(sessionIds: readonly string[]): Promise<void> {
    for (const sessionId of sessionIds) {
      await this.cache.drop(keyOf(sessionId));
    }
  }

  private read(sessionId: string): Promise<number | null> {
    return this.cache.read(keyOf(sessionId), async () => {
      const row = await this.sessions.findById(sessionId);
      return row?.expiresAt.getTime() ?? null;
    });
  }
}

function keyOf(sessionId: string): string {
  return `${PREFIX}:${sessionId}`;
}
