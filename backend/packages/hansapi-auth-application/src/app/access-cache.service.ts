import { Inject, Injectable, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AppApiKey, AppClient } from '@hansapi/data';

import { ACCESS_CACHE_CONFIG } from '../auth.config';
import type { AccessCacheConfig } from '../auth.config';
import { AppRepository } from './app.repository';

/** 캐시 키 접두사. 하나의 Redis 를 여러 도메인이 공유하므로 auth 네임스페이스로 격리한다. */
const PREFIX = 'auth';

/** 캐시 값 래퍼. miss(undefined)와 "조회했는데 없음(null)"을 구분하려고 한 겹 감싼다. */
interface Wrapped<T> {
  v: T | null;
}

/**
 * 서비스 키·클라이언트 조회의 **2단 캐시**. 인증마다 DB 를 때리면 장애로 이어지므로 캐싱한다.
 *
 *   internalMap(프로세스 메모리, 기본 5분) → cache(Redis, 기본 10분) → DB
 *
 * cache 는 전역 CacheModule(ApplicationModule 이 REDIS_URL 로 등록)을 빌려 쓴다. 없으면
 * (auth 단독 구동) internalMap 만으로 동작한다 — 그래서 @Optional 이다.
 *
 * 무효화는 **키 단위**다. Redis 를 다른 도메인(병원 상세 캐시 등)과 공유하므로 통째로 비우면 안 된다.
 * 다만 internalMap 삭제는 이 인스턴스에만 적용되므로, 다중 인스턴스에서는 다른 인스턴스가
 * 최대 internalMap TTL(5분)만큼 늦게 반영된다.
 */
@Injectable()
export class AccessCache {
  private readonly internalMap = new Map<
    string,
    { w: Wrapped<unknown>; exp: number }
  >();

  constructor(
    private readonly apps: AppRepository,
    @Inject(ACCESS_CACHE_CONFIG) private readonly config: AccessCacheConfig,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /** 서비스 키 조회(appId+keyId). */
  getApiKey(appId: number, keyId: number): Promise<AppApiKey | null> {
    return this.read(`${PREFIX}:apikey:${appId}:${keyId}`, () =>
      this.apps.findApiKey(appId, keyId),
    );
  }

  /** 클라이언트 조회(공개 clientId). */
  getClient(clientId: string): Promise<AppClient | null> {
    return this.read(`${PREFIX}:client:${clientId}`, () =>
      this.apps.findClientByClientId(clientId),
    );
  }

  /** 서비스 키 무효화(재발급·삭제·앱 삭제 시). */
  invalidateApiKey(appId: number, keyId: number): Promise<void> {
    return this.drop(`${PREFIX}:apikey:${appId}:${keyId}`);
  }

  /** 클라이언트 무효화(생성·수정·시크릿 재발급·삭제·앱 삭제 시). */
  invalidateClient(clientId: string): Promise<void> {
    return this.drop(`${PREFIX}:client:${clientId}`);
  }

  /** internalMap → cache → DB 순으로 읽고, 읽은 값을 아래에서 위로 채운다. */
  private async read<T>(
    key: string,
    load: () => Promise<T | null>,
  ): Promise<T | null> {
    const hit = this.internalMap.get(key);
    if (hit) {
      if (hit.exp > Date.now()) {
        // LRU: 최근 사용으로 올린다(Map 은 삽입 순서를 지키므로 재삽입 = 맨 뒤로).
        this.internalMap.delete(key);
        this.internalMap.set(key, hit);
        return hit.w.v as T | null;
      }
      this.internalMap.delete(key); // 만료분은 여기서 정리한다.
    }

    const cached = await this.cache?.get<Wrapped<T>>(key);
    if (cached) {
      this.putInternal(key, cached);
      return cached.v;
    }

    const wrapped: Wrapped<T> = { v: await load() };
    this.putInternal(key, wrapped);
    await this.cache?.set(key, wrapped, this.config.sharedTtlSec * 1000);
    return wrapped.v;
  }

  /**
   * 메모리 캐시에 넣는다. 상한을 넘으면 **가장 오래 안 쓴 것부터** 버린다(LRU).
   * 존재하지 않는 키도 "없음"으로 캐싱되므로 상한이 없으면 무작위 조회만으로 계속 불어난다.
   */
  private putInternal(key: string, w: Wrapped<unknown>): void {
    // 이미 있으면 지웠다 다시 넣어 맨 뒤(최신)로 보낸다.
    this.internalMap.delete(key);
    this.internalMap.set(key, {
      w,
      exp: Date.now() + this.config.memoryTtlSec * 1000,
    });

    while (this.internalMap.size > this.config.memoryMaxEntries) {
      const oldest = this.internalMap.keys().next().value;
      if (oldest === undefined) break;
      this.internalMap.delete(oldest);
    }
  }

  private async drop(key: string): Promise<void> {
    this.internalMap.delete(key);
    await this.cache?.del(key);
  }
}
