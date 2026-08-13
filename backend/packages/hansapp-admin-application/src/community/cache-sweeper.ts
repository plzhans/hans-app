import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * 캐시 한 칸의 상태. **캐시 종류를 가리지 않고 같은 모양이다** — 콘솔이 하나의 패널로
 * 글 캐시든 게시판 목록 캐시든 같은 것을 묻기 때문이다.
 */
export interface CacheState {
  /** 환경 접두어(`develop:`)를 뺀 키. 붙이는 것은 저장소다. */
  readonly key: string;
  readonly hit: boolean;
  readonly expiresAt: Date | null;
  /** 남은 시간(ms). 만료 시각을 모르면 null. */
  readonly remainingMs: number | null;
  /** 담겨 있는 값 그대로. 화면이 JSON 으로 펴서 보여 준다. */
  readonly value: unknown;
  /**
   * 프로세스 밖에서도 공유되나. **false 면 지금 보는 것은 이 프로세스의 메모리다** —
   * 공개 API 가 다른 프로세스면 그쪽이 든 것은 여기서 보이지도, 지워지지도 않는다.
   */
  readonly shared: boolean;
}

/** 한 번에 훑을 키 수. 커서를 그만큼씩 굴린다. */
const SCAN_COUNT = 200;

/** 한 번에 지울 키 수. 수만 개를 한 명령에 넘기면 그 자체가 서버를 잡는다. */
const DELETE_BATCH = 100;

/**
 * 접두사로 캐시를 쓸어 담는 저장소 조작.
 *
 * **`KEYS` 를 쓰지 않는다.** Redis 는 명령 하나를 끝까지 처리하고 다음을 받으므로,
 * `KEYS board:post:*` 는 키를 다 훑는 동안 다른 요청을 전부 세운다. 대신 `SCAN` 으로
 * 커서를 조금씩 굴리며(한 번에 200개쯤) 사이사이 다른 명령이 끼어들 틈을 준다.
 *
 * 지우는 것도 나눈다 — 찾은 키를 한 번에 넘기지 않고 100개씩, `DEL` 이 아니라 `UNLINK` 로
 * 넘긴다. UNLINK 는 키를 목록에서 떼기만 하고 메모리 해제는 뒤에서 한다.
 *
 * **정확한 삭제를 약속하지 않는다.** SCAN 은 도는 중에 들어온 키를 못 볼 수 있다. 여기서
 * 지우는 것은 어차피 캐시라, 한 바퀴 놓친 키는 TTL 이 지나면 사라진다.
 */
@Injectable()
export class CacheSweeper {
  private readonly logger = new Logger(CacheSweeper.name);

  constructor(@Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache) {}

  /**
   * 키 하나를 들여다본다. 값과 **언제 만료되는지**까지.
   *
   * TTL 은 cache-manager 가 아니라 그 아래 Keyv 에게 직접 묻는다(`{ raw: true }`) —
   * 위쪽 API 는 값만 돌려주고 남은 시간을 알려주지 않는다.
   */
  async inspect(key: string): Promise<CacheState> {
    const empty: CacheState = {
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
      const shared = !(store.opts?.store instanceof Map);
      if (!raw) return { ...empty, shared };

      const expires = raw.expires ?? null;
      return {
        key,
        hit: true,
        expiresAt: expires === null ? null : new Date(expires),
        remainingMs: expires === null ? null : Math.max(0, expires - Date.now()),
        value: raw.value ?? null,
        shared,
      };
    } catch (error) {
      this.logger.warn(`캐시를 읽지 못했다(${key}): ${String(error)}`);
      return empty;
    }
  }

  /**
   * `prefix` 로 시작하는 키를 모두 지운다. 지운 개수를 돌려준다.
   *
   * prefix 는 환경 네임스페이스(`develop:`)를 뺀 값이다 — 그것은 저장소가 알아서 붙인다.
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    const store = this.cache?.stores?.[0];
    if (!store) return 0;

    try {
      const redis = redisOf(store);
      if (!redis) return this.sweepMemory(store, prefix);

      const namespace = store.namespace;
      const match = `${namespace ? `${namespace}:` : ''}${prefix}*`;

      let deleted = 0;
      let cursor = '0';
      let batch: string[] = [];
      do {
        const page = await redis.scan(cursor, { MATCH: match, COUNT: SCAN_COUNT });
        cursor = String(page.cursor);
        batch.push(...page.keys);
        if (batch.length >= DELETE_BATCH) {
          deleted += await unlink(redis, batch);
          batch = [];
        }
      } while (cursor !== '0');

      if (batch.length > 0) deleted += await unlink(redis, batch);
      return deleted;
    } catch (error) {
      // 캐시를 못 지웠다고 저장이 실패로 보이면 안 된다. TTL 이 지나면 어차피 맞춰진다.
      this.logger.warn(`캐시를 쓸지 못했다(${prefix}*): ${String(error)}`);
      return 0;
    }
  }

  /**
   * Redis 가 없을 때(인메모리 폴백). **이 프로세스 안에서만 지워진다.**
   *
   * 저장소가 그냥 Map 이라 훑어도 서버를 잡을 일이 없다 — 대신 여기서 지운 것은 다른
   * 프로세스의 캐시와 아무 상관이 없다.
   *
   * 기다릴 것이 없어 동기 메서드다. 부르는 쪽은 Promise 를 돌려주는 자리라 그대로 반환된다.
   */
  private sweepMemory(store: KeyvLike, prefix: string): number {
    const map = store.opts?.store;
    if (!(map instanceof Map)) return 0;

    // 키에는 저장소가 붙인 네임스페이스가 이미 들어 있다.
    const namespace = store.namespace as string | undefined;
    const head = `${namespace ? `${namespace}:` : ''}${prefix}`;
    const targets = [...map.keys()].filter(
      (key): key is string => typeof key === 'string' && key.startsWith(head),
    );
    for (const key of targets) map.delete(key);
    return targets.length;
  }
}

/** Keyv 안쪽 저장소. 여기서 필요한 것만 적는다(라이브러리 타입을 끌어오지 않는다). */
interface KeyvLike {
  namespace?: unknown;
  opts?: { store?: unknown };
}

interface RedisLike {
  scan(
    cursor: string,
    options: { MATCH: string; COUNT: number },
  ): Promise<{ cursor: string | number; keys: string[] }>;
  unlink(keys: string[]): Promise<number>;
}

/**
 * Keyv 안에 든 Redis 클라이언트. 인메모리 폴백이면 없다.
 *
 * cache-manager 도 Keyv 도 SCAN 을 열어 주지 않아 한 겹 내려가 직접 쓴다 — 그 대신
 * 여기 한 곳에만 저장소 구현을 안다.
 */
function redisOf(store: KeyvLike): RedisLike | null {
  const inner = store.opts?.store as { client?: unknown } | undefined;
  const client = inner?.client;
  if (!client || typeof client !== 'object') return null;
  const candidate = client as Partial<RedisLike>;
  return typeof candidate.scan === 'function' && typeof candidate.unlink === 'function'
    ? (candidate as RedisLike)
    : null;
}

async function unlink(redis: RedisLike, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return redis.unlink(keys);
}
