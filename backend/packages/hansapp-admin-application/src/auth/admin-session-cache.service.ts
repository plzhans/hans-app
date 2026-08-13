import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { inspectCacheEntry } from '../user/cache-inspector';
import type { CacheEntryState } from '../user/cache-inspector';
import { ADMIN_AUTH_CONFIG } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import { adminSessionKey, adminSessionsMatch, parseAdminSessionKey } from './admin-cache-keys';
import { AdminSessionRepository } from './admin-session.repository';

/** SCAN 한 번에 받을 키 수. 크면 Redis 가 한 번에 오래 붙잡히고, 작으면 왕복이 는다. */
const SCAN_COUNT = 200;

/** 지우기 재시도 횟수. 순간 장애를 넘기려는 것이지 오래 매달리려는 것이 아니다. */
const PURGE_ATTEMPTS = 3;

export type AdminSessionCacheState = CacheEntryState;

/** 캐시에 올라와 있는 세션 하나. 담는 값은 만료 시각뿐이다. */
export interface CachedAdminSession {
  readonly sessionId: number;
  readonly adminId: number;
  /** 세션 만료 시각(epoch ms). 못 읽었거나 "없는 세션" 으로 캐싱된 것이면 0. */
  readonly expiresAt: number;
}

/**
 * 관리자 로그인 세션 캐시. **access token 을 매 요청 세션과 대조하기 위한 것이다.**
 *
 * access token 은 서명만으로 검증되는 JWT 라, 그것만 보면 세션을 끊어도 만료(기본 1시간)까지
 * 계속 통한다. 그렇다고 요청마다 DB 를 볼 수는 없어서 이 캐시를 사이에 둔다 — 서명 검증은
 * 늘 하고, 그 뒤 sid 로 여기를 한 번 본다.
 *
 * **회원 쪽(SessionCache)과 달리 한 단이다.** 그쪽은 공개 API 라 요청량을 우리가 정하지
 * 못해 프로세스 메모리를 앞에 한 겹 더 두는데, 콘솔은 부르는 사람이 관리자 몇 명뿐이라
 * 그 한 겹이 버는 것보다 잃는 것이 크다 — 메모리 단은 밖에서 지울 수 없어서, 콘솔이
 * "캐시를 지웠다" 고 말한 뒤에도 다른 인스턴스가 옛 판단을 들고 있게 된다.
 *
 * **수명은 그 토큰에 맞춘다.** 상한(sessionCacheTtlSec)과 access token 의 남은 시간 중
 * 짧은 쪽이라, 칸이 토큰보다 오래 사는 일이 없다 — 그 뒤에는 어차피 갱신을 거치며 DB 를
 * 다시 본다. 회원 세션 캐시가 Redis 상한을 access token 수명에 맞춘 것과 같은 규칙이다.
 *
 * **키는 sid 다. 토큰이 아니다.** 폐기의 단위가 세션이라 그렇다 — 토큰으로 캐싱하면 지울
 * 키를 알 수 없고(발급된 토큰 문자열을 모른다), rotate 마다 키가 새로 생겨 계속 불어난다.
 *
 * **"없는 세션" 도 캐싱한다.** 끊긴 세션의 토큰이야말로 요청이 몰리는 쪽이라, 그것을
 * 캐싱하지 않으면 매번 DB 까지 내려간다.
 *
 * **캐시가 없어도 돈다.** CLI 처럼 CacheModule 이 없는 프로세스에서는 늘 DB 를 본다.
 */
@Injectable()
export class AdminSessionCache {
  private readonly logger = new Logger(AdminSessionCache.name);

  constructor(
    private readonly sessions: AdminSessionRepository,
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * 이 세션이 아직 살아 있나. 가드가 요청마다 부른다.
   *
   * **만료는 캐시된 값으로 판단하되, 지났으면 원천을 다시 본다.** 캐시에 담긴 만료 시각은
   * rotate 로 연장되기 전 값일 수 있어서, 그대로 믿고 거절하면 멀쩡히 쓰고 있는 세션이
   * 튕긴다. 지난 것처럼 보일 때만 한 번 더 확인하므로 비용은 만료 언저리에서만 든다.
   *
   * **캐시 수명은 그 access token 에서도 뽑는다**(`tokenExpSec`). 토큰의 만료는 발급 때
   * 정해져 바뀌지 않고, 그 시각이 지나면 클라이언트는 갱신을 거치는데 갱신은 어차피 DB 를
   * 본다 — 그 뒤까지 판단을 들고 있을 이유가 없다.
   */
  async isLive(adminId: number, sessionId: number, tokenExpSec?: number): Promise<boolean> {
    const alive = remainingSec(tokenExpSec);
    const cached = await this.read(adminId, sessionId, alive);
    if (cached === null) return false;
    if (cached > Date.now()) return true;

    await this.drop(adminSessionKey(adminId, sessionId));
    const fresh = await this.read(adminId, sessionId, alive);
    return fresh !== null && fresh > Date.now();
  }

  /** 폐기된 세션을 캐시에서 지운다. **폐기 경로가 전부 여기를 지난다.** */
  async invalidate(adminId: number, sessionIds: readonly number[]): Promise<void> {
    for (const sessionId of sessionIds) {
      await this.drop(adminSessionKey(adminId, sessionId));
    }
  }

  /**
   * 이 캐시가 프로세스 밖에서도 공유되나(Redis).
   *
   * **false 면 콘솔에 보이는 것이 전부가 아니다** — 관리자 API 가 여러 대면 나머지가 들고
   * 있는 것은 여기서 보이지도, 지워지지도 않는다. 키를 훑는 것(listByAdmin)도 Redis 에서만
   * 되므로, 이 값이 false 면 캐시 화면은 늘 빈 목록이다.
   *
   * 판정은 cache-inspector 와 같다 — Keyv 의 기본 저장소는 그냥 `Map` 이고, 그것이면
   * 이 프로세스 안에서만 사는 캐시다.
   */
  get shared(): boolean {
    const store = this.cache?.stores?.[0] as { opts?: { store?: unknown } } | undefined;
    return !!store && !(store.opts?.store instanceof Map);
  }

  /** 캐시 한 칸에 실제로 담긴 값. 콘솔이 들여다볼 때만 쓴다. */
  inspect(adminId: number, sessionId: number): Promise<AdminSessionCacheState> {
    return inspectCacheEntry(this.cache, adminSessionKey(adminId, sessionId), (error) =>
      this.logger.warn(`세션 캐시를 읽지 못했다(sid=${sessionId}): ${String(error)}`),
    );
  }

  /**
   * 이 관리자의 캐시에 올라와 있는 세션 전부.
   *
   * **KEYS 를 쓰지 않는다.** 그 명령은 훑는 동안 Redis 를 멈춰 세우는데, 이 Redis 는
   * 캐시·세션·큐를 여러 도메인이 나눠 쓰고 있어 그 사이 전부가 멈춘다. 커서로 조금씩
   * 받아 오는 SCAN 을 쓴다 — 중복이 오거나 도중에 생긴 키를 놓칠 수 있지만, 이 자리에
   * "정확히 한 번" 은 필요 없다(다음 조회가 잡는다).
   */
  async listByAdmin(adminId: number): Promise<CachedAdminSession[]> {
    const client = await this.scanner();
    if (!client) return [];

    const found: CachedAdminSession[] = [];
    const seen = new Set<string>();
    try {
      for await (const chunk of client.scanIterator({
        MATCH: adminSessionsMatch(adminId),
        COUNT: SCAN_COUNT,
      })) {
        const keys = Array.isArray(chunk) ? chunk : [chunk];
        for (const key of keys) {
          const parsed = parseAdminSessionKey(key);
          if (!parsed || seen.has(key)) continue;
          seen.add(key);

          found.push({
            ...parsed,
            expiresAt: await this.readExpiry(parsed.adminId, parsed.sessionId),
          });
        }
      }
    } catch (error) {
      // 훑다 끊겨도 받아 둔 만큼은 쓴다. 부르는 쪽은 "덜 보일 수 있다" 만 감안하면 된다.
      this.logger.error(`세션 캐시를 훑지 못했다(adminId=${adminId})`, error);
    }
    return found;
  }

  /**
   * 캐시 한 칸을 지운다. **지웠는지 확인하고 그 결과를 돌려준다.**
   *
   * 다른 캐시와 다르게 실패를 삼키지 않는 이유가 있다 — 이 캐시가 남아 있으면 끊은 기기가
   * 그대로 통과한다. 조용히 넘어가면 아무도 모르는 채로 그 칸이 만료될 때까지 열려 있다.
   * 대신 던지지도 않는다: 부르는 쪽마다 사정이 달라 판단은 호출부에 맡긴다.
   */
  async purge(adminId: number, sessionId: number): Promise<boolean> {
    const key = adminSessionKey(adminId, sessionId);
    for (let attempt = 1; attempt <= PURGE_ATTEMPTS; attempt += 1) {
      try {
        await this.cache?.del(key);
        const left = await this.cache?.get(key);
        if (left === undefined || left === null) return true;
      } catch (error) {
        this.logger.warn(
          `세션 캐시를 지우지 못했다(sid=${sessionId}, ${attempt}/${PURGE_ATTEMPTS}): ${String(error)}`,
        );
      }
    }
    this.logger.error(`세션 캐시가 남았다: sid=${sessionId}`);
    return false;
  }

  /**
   * 캐시에 담긴 만료 시각. 없으면 null.
   *
   * **한 겹 감싸서 넣는다**(`{ v: ... }`). 그래야 꺼낼 때 "캐시에 없다" 와 "조회했는데
   * 그런 세션이 없더라" 가 갈린다 — 뒤엣것을 캐싱하지 못하면 끊긴 토큰이 매번 DB 로 내려간다.
   */
  private async read(
    adminId: number,
    sessionId: number,
    maxAliveSec?: number,
  ): Promise<number | null> {
    const key = adminSessionKey(adminId, sessionId);
    try {
      const cached = await this.cache?.get<{ v: number | null }>(key);
      if (cached) return cached.v;
    } catch (error) {
      // 캐시가 흔들려도 인증을 실패로 만들지 않는다. 원천(DB)이 답을 갖고 있다.
      this.logger.warn(`세션 캐시를 읽지 못했다(sid=${sessionId}): ${String(error)}`);
    }

    const row = await this.sessions.findOwned(adminId, sessionId);
    const value = row?.expiresAt.getTime() ?? null;
    try {
      await this.cache?.set(key, { v: value }, this.ttlSec(maxAliveSec) * 1000);
    } catch (error) {
      this.logger.warn(`세션 캐시에 넣지 못했다(sid=${sessionId}): ${String(error)}`);
    }
    return value;
  }

  private async readExpiry(adminId: number, sessionId: number): Promise<number> {
    const raw = await this.cache?.get<{ v?: unknown }>(adminSessionKey(adminId, sessionId));
    return typeof raw?.v === 'number' ? raw.v : 0;
  }

  private async drop(key: string): Promise<void> {
    try {
      await this.cache?.del(key);
    } catch (error) {
      /*
        **캐시가 흔들려도 폐기를 실패로 만들지 않는다.** DB 행은 이미 지워졌고, 남은 캐시는
        길어야 상한만큼 뒤에 사라진다. 콘솔에서 부르는 쪽(purge)만 결과를 따진다.
      */
      this.logger.error(`세션 캐시를 지우지 못했다 — ${key}`, error);
    }
  }

  /**
   * 이 항목이 캐시에 앉아 있을 초. **상한과 쓸모 중 짧은 쪽이다.**
   *
   * 0 을 그대로 주면 저장소에 따라 "무제한" 으로 읽힐 수 있어 1초를 바닥으로 둔다.
   */
  private ttlSec(maxAliveSec?: number): number {
    const limit = this.config.sessionCacheTtlSec;
    if (maxAliveSec === undefined) return limit;
    return Math.max(1, Math.min(limit, Math.floor(maxAliveSec)));
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

/** 토큰 만료(epoch 초)까지 남은 초. 값이 없거나 이미 지났으면 undefined(단 상한을 쓴다). */
function remainingSec(expSec?: number): number | undefined {
  if (!expSec) return undefined;
  const left = expSec - Math.floor(Date.now() / 1000);
  return left > 0 ? left : undefined;
}
