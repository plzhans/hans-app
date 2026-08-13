import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/** SCAN 한 번에 받을 키 수. 크면 Redis 가 한 번에 오래 붙잡히고, 작으면 왕복이 는다. */
const SCAN_COUNT = 500;

/** 지운 결과. */
export interface CachePurgeResult {
  /** 지운 키 수. */
  readonly removed: number;
  /** 캐시 저장소가 붙어 있었나. false 면 removed 는 0 이고 "못 지웠다" 가 아니라 "볼 수 없다" 다. */
  readonly connected: boolean;
}

/**
 * 패턴으로 캐시를 통째로 지운다.
 *
 * **`KEYS` 를 쓰지 않는다.** 그 명령은 훑는 동안 Redis 를 멈춰 세우는데, 이 Redis 는
 * 캐시·세션·큐를 여러 도메인이 나눠 쓰고 있어 그 사이 전부가 멈춘다. 커서로 조금씩 받아
 * 오는 SCAN 을 쓴다 — 도중에 생긴 키를 놓칠 수 있지만, 일괄 정리에 "정확히 한 번" 은
 * 필요 없다(다시 누르면 된다).
 *
 * **환경 접두어를 패턴 앞에 붙이지 않는다.** CacheModule 이 키에 `develop:` 을 붙이므로
 * 부르는 쪽이 `*` 로 시작하는 패턴을 준다 — 접두어 모양이 바뀌어도 따라가지 않아도 된다.
 *
 * **삭제는 Keyv 를 통해 한다.** 훑을 때는 원시 키를 보지만 지울 때는 캐시가 쓰는 통로를
 * 그대로 써야, 접두어를 여기서 다시 조립하는 일이 생기지 않는다.
 */
@Injectable()
export class CachePurgeService {
  private readonly logger = new Logger(CachePurgeService.name);

  constructor(@Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache) {}

  /** 패턴에 걸리는 키 수를 센다. 지우기 전에 규모를 보여 주려는 값이다. */
  async count(match: string): Promise<CachePurgeResult> {
    return this.sweep(match, false);
  }

  async purge(match: string): Promise<CachePurgeResult> {
    return this.sweep(match, true);
  }

  private async sweep(match: string, remove: boolean): Promise<CachePurgeResult> {
    const client = await this.scanner();
    if (!client) return { removed: 0, connected: false };

    let removed = 0;
    try {
      for await (const chunk of client.scanIterator({
        MATCH: match,
        COUNT: SCAN_COUNT,
      })) {
        const keys = Array.isArray(chunk) ? chunk : [chunk];
        for (const key of keys) {
          if (remove) await this.cache?.del(stripNamespace(key));
          removed += 1;
        }
      }
    } catch (error) {
      // 훑다 끊겨도 지운 만큼은 반영됐다. 다시 누르면 나머지를 잡는다.
      this.logger.error(`캐시 정리 중 오류 — ${match}`, error);
    }

    if (remove) this.logger.warn(`캐시 정리 — ${match} ${removed}건`);
    return { removed, connected: true };
  }

  /** 커서로 키를 훑을 수 있는 클라이언트. Redis 가 아니면 undefined. */
  private async scanner(): Promise<RedisScanner | undefined> {
    const store = this.cache?.stores?.[0] as
      { opts?: { store?: { getClient?: () => Promise<unknown> } } } | undefined;
    const adapter = store?.opts?.store;
    if (typeof adapter?.getClient !== 'function') return undefined;

    const client = (await adapter.getClient()) as Partial<RedisScanner>;
    return typeof client?.scanIterator === 'function' ? (client as RedisScanner) : undefined;
  }
}

/** 커서로 키를 훑을 수 있는 클라이언트. 필요한 만큼만 적는다. */
interface RedisScanner {
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string | string[]>;
}

/**
 * 원시 키에서 환경 접두어를 떼어 낸다.
 *
 * SCAN 은 `develop:auth:users:12:profile` 을 주는데 Keyv 의 `del` 은 접두어 없는 키를
 * 받는다 — 우리 키는 전부 도메인 이름(`auth`·`board`)으로 시작하므로 그 앞의 한 조각만
 * 떼면 된다. 접두어가 없는 환경(네임스페이스 미설정)에서는 그대로 둔다.
 */
function stripNamespace(key: string): string {
  const at = key.indexOf(':');
  if (at < 0) return key;

  const head = key.slice(0, at);
  return head === 'auth' || head === 'board' ? key : key.slice(at + 1);
}
