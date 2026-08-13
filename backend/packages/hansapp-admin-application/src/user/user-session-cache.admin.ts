import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { ALL_SESSIONS_MATCH, parseSessionKey, sessionKey, sessionsMatch } from './auth-cache-keys';
import { inspectCacheEntry } from './cache-inspector';
import type { CacheEntryState } from './cache-inspector';

/**
 * 세션 캐시 키. **정본은 인증 계층의 SessionCache 다**(packages/hansapp-auth-application/
 * src/session-cache.service.ts). 관리자 계층이 그 계층을 의존하지 않으려고 형식을 다시
 * 적는다 — 그쪽이 바뀌면 이 파일도 같이 고쳐야 한다(내 정보 캐시와 같은 방식).
 *
 * 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */

/** 지우기 재시도 횟수. 순간 장애를 넘기려는 것이지 오래 매달리려는 것이 아니다. */
const PURGE_ATTEMPTS = 3;

export type SessionCacheState = CacheEntryState;

/** SCAN 한 번에 받을 키 수. 크면 Redis 가 한 번에 오래 붙잡히고, 작으면 왕복이 는다. */
const SCAN_COUNT = 500;

/**
 * 캐시에 올라와 있는 세션 하나.
 *
 * **정본은 인증 계층의 CachedSession 이다**(session-cache.service.ts). 그쪽이 담는 모양을
 * 여기서 다시 적는다 — 계층을 의존하지 않으려는 것이고, 그쪽이 바뀌면 여기도 고쳐야 한다.
 */
export interface CachedSession {
  readonly sessionId: number;
  readonly userId: number;
  /** 세션 만료 시각(epoch ms). 못 읽었으면 0. */
  readonly expiresAt: number;
}

/**
 * 로그인 세션 캐시를 들여다보고 지운다.
 *
 * **이 캐시가 인증 경로에서 가장 뜨거운 자리다.** 가드가 요청마다 `sid` 로 여기를 보고,
 * 없을 때만 DB 로 내려간다 — 기기 목록이 DB 를 보고 그리는 것과 달리, 실제 통과 여부를
 * 정하는 것은 이 캐시다. 그래서 "끊었는데 왜 아직 되지" 를 가리려면 여기를 봐야 한다.
 *
 * **지우는 것은 폐기가 아니다.** 세션 행은 그대로 두고 캐시만 비운다 — 다음 요청이 DB 를
 * 다시 읽을 뿐이라, 살아 있는 세션이면 그대로 통과한다. 기기를 끊는 것은 로그아웃 쪽이다.
 *
 * **여기서 지워지는 것은 공유 캐시(Redis)뿐이다.** 각 API 인스턴스가 앞에 둔 메모리 단은
 * 밖에서 손댈 수 없다. 폐기(로그아웃)와 달리 이벤트를 올리지 않는 이유는, 이건 진단용
 * 버튼이지 "세션이 폐기됐다" 는 사실이 아니어서다 — 없는 사실을 알리면 받는 쪽이 그 이름을
 * 믿고 다른 일을 하게 된다. 메모리 단은 TTL(기본 1분)로 스스로 빠진다.
 */
@Injectable()
export class UserSessionCacheAdmin {
  private readonly logger = new Logger(UserSessionCacheAdmin.name);

  constructor(@Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache) {}

  inspect(userId: number, sessionId: number): Promise<SessionCacheState> {
    return inspectCacheEntry(this.cache, sessionKey(userId, sessionId), (error) =>
      this.logger.warn(`세션 캐시를 읽지 못했다(sid=${sessionId}): ${String(error)}`),
    );
  }

  /**
   * 캐시에 올라와 있는 세션을 전부 훑는다.
   *
   * **KEYS 를 쓰지 않는다.** 그 명령은 훑는 동안 Redis 를 멈춰 세우는데, 이 Redis 는
   * 캐시·세션·큐를 여러 도메인이 나눠 쓰고 있어 그 사이 전부가 멈춘다. 커서로 조금씩
   * 받아 오는 SCAN 을 쓴다 — 중복이 오거나 도중에 생긴 키를 놓칠 수 있지만, 이 자리에
   * "정확히 한 번" 은 필요 없다(다음 조회·다음 회차가 잡는다).
   *
   * 세션은 계정마다 상한이 있어 전체 수가 회원 수의 몇 배로 묶인다 — 통째로 받아 와도
   * 감당할 크기다.
   */
  scanAll(): Promise<CachedSession[]> {
    return this.scan(ALL_SESSIONS_MATCH);
  }

  /**
   * 이 회원의 것만.
   *
   * **키에 회원번호가 박혀 있어 패턴으로 좁힌다.** 전체를 훑어 값을 하나씩 읽고 거르던
   * 것과 달리, 걸러진 키만 읽으므로 회원 한 명당 몇 번으로 끝난다.
   */
  listByUser(userId: number): Promise<CachedSession[]> {
    return this.scan(sessionsMatch(userId));
  }

  private async scan(match: string): Promise<CachedSession[]> {
    const client = await this.scanner();
    if (!client) return [];

    const found: CachedSession[] = [];
    const seen = new Set<string>();
    try {
      for await (const chunk of client.scanIterator({
        MATCH: match,
        COUNT: SCAN_COUNT,
      })) {
        const keys = Array.isArray(chunk) ? chunk : [chunk];
        for (const key of keys) {
          const parsed = parseSessionKey(key);
          if (!parsed || seen.has(key)) continue;
          seen.add(key);

          found.push({
            ...parsed,
            expiresAt: await this.readExpiry(parsed.userId, parsed.sessionId),
          });
        }
      }
    } catch (error) {
      // 훑다 끊겨도 받아 둔 만큼은 쓴다. 부르는 쪽은 "덜 보일 수 있다" 만 감안하면 된다.
      this.logger.error('세션 캐시를 훑지 못했다', error);
    }
    return found;
  }

  /** 여러 세션의 상태를 한 번에. 목록 한 페이지가 통째로 쓴다. */
  inspectMany(userId: number, sessionIds: readonly number[]): Promise<SessionCacheState[]> {
    return Promise.all(sessionIds.map((id) => this.inspect(userId, id)));
  }

  /**
   * 지운다. **지웠는지 확인하고 그 결과를 돌려준다.**
   *
   * 다른 캐시와 다르게 실패를 삼키지 않는 이유가 있다 — 이 캐시가 남아 있으면 끊은 기기가
   * 그대로 통과한다. 조용히 넘어가면 아무도 모르는 채로 최대 상한(기본 1시간)만큼 열려 있다.
   * 대신 던지지도 않는다: 부르는 쪽마다 사정이 달라(폐기는 알려야 하고 진단 버튼은 아니다)
   * 판단은 호출부에 맡긴다.
   *
   * **지운 뒤 되읽어 본다.** `del` 이 조용히 실패하는 경우(연결이 끊겼다 붙는 사이 등)를
   * 성공으로 세지 않으려는 것이다. 한 번 더 읽는 비용은 이 자리에서 아깝지 않다.
   */
  async purge(userId: number, sessionId: number): Promise<boolean> {
    const key = sessionKey(userId, sessionId);
    for (let attempt = 1; attempt <= PURGE_ATTEMPTS; attempt += 1) {
      try {
        await this.cache?.del(key);
        const left = await this.cache?.get(key);
        if (left === undefined || left === null) {
          this.logger.log(`세션 캐시 초기화: sid=${sessionId}`);
          return true;
        }
      } catch (error) {
        this.logger.warn(
          `세션 캐시를 지우지 못했다(sid=${sessionId}, ${attempt}/${PURGE_ATTEMPTS}): ${String(error)}`,
        );
      }
    }
    /*
      여기까지 오면 캐시에 남아 있다. **배치가 나중에 치운다**(SessionCacheSweeper) —
      DB 행이 없는 키를 훑어 지우므로, 놓친 것이 영영 남지는 않는다.
    */
    this.logger.error(`세션 캐시가 남았다: sid=${sessionId}`);
    return false;
  }

  /**
   * 담긴 만료 시각. 값이 없거나 모양이 다르면(옛 판 등) 0.
   *
   * **한 겹 벗겨서 읽는다.** 인증 계층이 `{ v: <값> }` 로 감싸 넣기 때문이다 — 캐시 미스와
   * "조회했는데 없음" 을 가르려는 껍데기라, 그걸 모르고 읽으면 항상 0 이 나온다.
   */
  private async readExpiry(userId: number, sessionId: number): Promise<number> {
    const raw = await this.cache?.get<{ v?: unknown }>(sessionKey(userId, sessionId));
    return typeof raw?.v === 'number' ? raw.v : 0;
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
