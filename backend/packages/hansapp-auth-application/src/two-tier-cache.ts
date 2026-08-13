import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/**
 * 2단 캐시의 몸통. **프로바이더가 아니라 값 객체다** — 캐시가 필요한 서비스가 하나씩 들고 쓴다.
 *
 *   프로세스 메모리(memoryTtlSec) → 공유 캐시 Redis(sharedTtlSec) → 원천(DB)
 *
 * 세션·프로필 캐시가 같은 구조를 쓰는데, 같은 코드를 두 번 적으면 한쪽만 고쳐지는 날이 온다 —
 * single-flight 나 LRU 처럼 눈에 안 보이는 부분일수록 그렇다.
 *
 * **"없음" 도 값이다.** miss(undefined)와 "조회했는데 없더라"(null)를 구분한다. 구분하지 않으면
 * 없는 키로 오는 요청이 매번 원천까지 내려간다 — 폐기된 세션처럼 하필 요청이 몰리는 쪽이
 * 그 경로를 탄다.
 *
 * **Redis 가 없어도 돈다.** 로컬 등 캐시를 안 붙인 환경에서는 메모리 단만으로 동작한다.
 */
export class TwoTierCache<T> {
  private readonly memory = new Map<string, { value: T | null; exp: number }>();

  /**
   * 진행 중인 조회(single-flight). 같은 키를 동시에 여러 요청이 물으면 **한 번만** 읽고
   * 나머지는 그 Promise 에 편승한다 — 캐시가 빈 순간(재시작·TTL 만료)에 요청이 몰려도
   * 원천을 한 번만 때린다.
   *
   * Node 는 싱글스레드라 락이 필요 없다: 아래 read() 의 `get → set` 구간에 await 가 없어
   * 원자적으로 실행되므로, 두 번째 요청은 반드시 등록된 Promise 를 본다.
   */
  private readonly inflight = new Map<string, Promise<T | null>>();

  constructor(
    private readonly config: {
      readonly memoryTtlSec: number;
      readonly sharedTtlSec: number;
      readonly memoryMaxEntries: number;
    },
    private readonly shared: Cache | undefined,
    private readonly logger: Logger,
  ) {}

  /** 메모리 → Redis → 원천 순으로 읽고, 읽은 값을 아래에서 위로 채운다. */
  read(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const hit = this.memory.get(key);
    if (hit) {
      if (hit.exp > Date.now()) {
        // LRU: 최근 사용으로 올린다(Map 은 삽입 순서를 지키므로 재삽입 = 맨 뒤로).
        this.memory.delete(key);
        this.memory.set(key, hit);
        return Promise.resolve(hit.value);
      }
      this.memory.delete(key); // 만료분은 여기서 정리한다.
    }

    // 여기부터 끝까지 await 가 없다 — 다른 요청이 끼어들기 전에 inflight 에 등록된다.
    const running = this.inflight.get(key);
    if (running) return running;

    const loading = this.load(key, load).finally(() => this.inflight.delete(key));
    this.inflight.set(key, loading);
    return loading;
  }

  /**
   * 두 단을 함께 비운다.
   *
   * **메모리만 비우면 소용이 없다.** 바로 다음 요청이 Redis 에서 옛 값을 받아 메모리에
   * 도로 채운다. Redis 는 공유라 어느 인스턴스가 지우든 한 번이면 되고, 두 번 지워도
   * 결과는 같다(멱등).
   */
  async drop(key: string): Promise<void> {
    this.memory.delete(key);
    // 진행 중이던 조회에 이후 요청이 편승하지 않게 한다(무효화 이전 값일 수 있다).
    this.inflight.delete(key);
    try {
      await this.shared?.del(key);
    } catch (error) {
      /*
        **캐시가 흔들려도 본업을 실패로 만들지 않는다.** 여기서 던지면 "저장하지 못했습니다"
        가 뜨는데 DB 는 이미 바뀐 뒤다. 남은 캐시는 길어야 sharedTtlSec 뒤에 사라진다.
      */
      this.logger.error(`캐시를 지우지 못했다 — ${key}`, error);
    }
  }

  private async load(key: string, fromSource: () => Promise<T | null>): Promise<T | null> {
    const cached = await this.shared?.get<{ v: T | null }>(key);
    if (cached) {
      this.putMemory(key, cached.v);
      return cached.v;
    }

    const value = await fromSource();
    this.putMemory(key, value);
    // 한 겹 감싸서 넣는다 — 그래야 꺼낼 때 miss 와 "없음" 이 갈린다.
    await this.shared?.set(key, { v: value }, this.config.sharedTtlSec * 1000);
    return value;
  }

  /** 메모리 캐시에 넣는다. 상한을 넘으면 가장 오래 안 쓴 것부터 버린다(LRU). */
  private putMemory(key: string, value: T | null): void {
    this.memory.delete(key);
    this.memory.set(key, {
      value,
      exp: Date.now() + this.config.memoryTtlSec * 1000,
    });

    while (this.memory.size > this.config.memoryMaxEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }
}
