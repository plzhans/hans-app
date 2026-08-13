import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { SESSION_CACHE_CONFIG } from './auth.config';
import type { SessionCacheConfig } from './auth.config';
import { TokenSessionRepository } from './repository/token-session.repository';
import { TwoTierCache } from './two-tier-cache';
import { sessionKey } from './auth-cache-keys';

/** 캐시 키 접두사. 하나의 Redis 를 여러 도메인이 공유하므로 auth 네임스페이스로 격리한다. */

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
 * **키가 회원번호와 묶인다**(`auth:users:{<userId>}:sess:<sid>`). 두 가지를 얻는다 —
 *
 *  - 남의 것을 건드릴 수 없다. sid 하나로 열리는 키였다면 회원 확인을 잊은 코드가 곧바로
 *    구멍이 되는데, 키에 회원번호가 박혀 있으면 애초에 그 키가 없다.
 *  - 세션 행이 지워지고 캐시만 남아도(폐기 중 Redis 삭제 실패) 그것이 누구 것인지 키만
 *    보고 안다. 관리자 화면이 "이 회원의 잘못된 캐시" 로 추릴 수 있는 근거가 이것이다.
 *
 * 담는 값은 **만료 시각(epoch ms)** 하나다. Date 를 넣으면 Redis 를 거치며 문자열이 되고,
 * 회원번호는 키가 이미 들고 있어 값에 또 적지 않는다 — 같은 사실을 두 곳에 두면 어긋난다.
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
   *
   * **캐시 수명은 그 access token 에서 뽑는다**(`tokenExpSec`). 토큰의 만료는 발급 때
   * 정해져 바뀌지 않고, 그 시각이 지나면 클라이언트는 갱신을 거치는데 갱신은 어차피 DB 를
   * 본다 — 그 뒤까지 판단을 들고 있을 이유가 없다. 세션(refresh, 기본 7일)과는 다른
   * 시계라 세션 만료를 쓰면 훨씬 긴 값이 나온다.
   */
  async isLive(userId: number, sessionId: number, tokenExpSec?: number): Promise<boolean> {
    const alive = remainingSec(tokenExpSec);
    const cached = await this.read(userId, sessionId, alive);
    if (cached === null) return false;
    if (cached > Date.now()) return true;

    await this.cache.drop(sessionKey(userId, sessionId));
    const fresh = await this.read(userId, sessionId, alive);
    return fresh !== null && fresh > Date.now();
  }

  /** 폐기된 세션을 캐시에서 지운다. */
  async invalidate(userId: number, sessionIds: readonly number[]): Promise<void> {
    for (const sessionId of sessionIds) {
      await this.cache.drop(sessionKey(userId, sessionId));
    }
  }

  private read(userId: number, sessionId: number, maxAliveSec?: number): Promise<number | null> {
    return this.cache.read(
      sessionKey(userId, sessionId),
      async () => {
        // 키가 복합키라 (회원, 세션) 짝이 맞는 행만 나온다.
        const row = await this.sessions.findOwned(userId, sessionId);
        return row?.expiresAt.getTime() ?? null;
      },
      maxAliveSec,
    );
  }
}

/** 토큰 만료(epoch 초)까지 남은 초. 값이 없거나 이미 지났으면 undefined(단 상한을 쓴다). */
function remainingSec(expSec?: number): number | undefined {
  if (!expSec) return undefined;
  const left = expSec - Math.floor(Date.now() / 1000);
  return left > 0 ? left : undefined;
}
