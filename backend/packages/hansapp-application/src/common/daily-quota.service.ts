import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from '@redis/client';
import type { ConfigSource } from '@hansapp/common';

/** 하루 경계. **KST 기준이다** — 한국 서비스라 "오늘" 이 사용자의 오늘과 같아야 한다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 키 수명. 하루보다 넉넉히 잡아 자정 직전 증가분이 곧바로 사라지지 않게 한다. */
const KEY_TTL_SEC = 36 * 60 * 60;

/**
 * 하루 단위 호출 총량 계수기.
 *
 * **rate limit 과 다른 것을 막는다.** IP 당 분당 제한은 한 명이 얼마나 빨리 부르는지를
 * 묶을 뿐, **총액을 묶지 못한다** — IP 100 개면 분당 1,000 회고 그건 그대로 요금이다.
 * 게다가 모바일은 CGNAT 라 IP 하나를 수천 명이 공유해서, 조이면 정상 사용자가 먼저 막힌다.
 *
 * 여기서 세는 것은 **오늘 실제로 나간 외부 호출 수**다. 누가 어떻게 때리든 하루 요금이
 * 상한 안에 갇힌다 — 최악의 경우를 실제로 묶어 주는 유일한 방어다.
 *
 * **Redis 다.** 인메모리로 두면 배포·재시작마다 그날 카운터가 0 으로 돌아가, 공격자가
 * 아니라 우리 배포 주기가 상한을 무력화한다. INCR 이라 동시 요청에도 안 샌다.
 *
 * **셀 수 없으면 막는다(fail-closed).** 캐시와 반대다 — 캐시가 죽으면 느려질 뿐이지만
 * 계수기가 죽으면 상한 자체가 사라진다. 그것도 하필 필요할 때. Redis 를 흔들 수 있는
 * 공격자는 그것만으로 한도를 무력화하게 된다.
 *
 * 반대 비용은 작다. AI 검색은 부가 기능이라 막혀도 병원 검색 본체는 그대로 돌고,
 * 막힌 사실이 로그·알림으로 드러난다 — 조용히 돈이 새는 것보다 낫다.
 *
 * 예외는 **Redis 를 아예 안 쓰는 배포**다(redis.url 미설정). 그건 고장이 아니라 구성이라
 * 통과시킨다 — 로컬 개발이 그 경우다. 대신 켜져 있는 한도가 무의미해지므로 경고를 남긴다.
 */
@Injectable()
export class DailyQuotaService implements OnModuleDestroy {
  private readonly logger = new Logger(DailyQuotaService.name);
  private readonly url?: string;
  /**
   * 키 앞머리. **cache-manager 가 거는 것과 같은 규칙이다**(`<env>:`) — 하나의 Redis 를
   * 여러 환경이 공유하므로, develop 의 카운터가 production 몫을 깎으면 안 된다.
   *
   * 그쪽은 createKeyv 의 namespace 가 자동으로 걸어 주는데 여기는 원시 클라이언트라
   * 직접 붙인다. 규칙이 갈리면 같은 Redis 안에서 우리 키만 규칙 밖에 놓인다.
   */
  private readonly prefix: string;
  private client?: RedisClientType;
  private connecting?: Promise<RedisClientType | undefined>;
  private warned = false;

  constructor(source: ConfigSource) {
    this.url = source.getUrlOrDefault('redis.url') || undefined;
    this.prefix = `${source.env}:`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }

  /**
   * 오늘 몫을 하나 쓴다. **넘었으면 false.**
   *
   * `scope` 가 계수 단위다. 누구 몫인지를 부르는 쪽이 정한다:
   *   `ai-search:app:7`     로그인 전 — 앱(appId)마다 한 통
   *   `ai-search:user:123`  로그인 후 — 사람마다 따로
   *
   * `limit` 이 0 이하면 제한 없음으로 본다 — 설정을 비워 끄는 길을 남긴다.
   */
  async take(scope: string, limit: number): Promise<boolean> {
    if (limit <= 0) {
      return true;
    }
    if (!this.url) {
      // 구성상 Redis 가 없는 배포(로컬 등). 고장이 아니므로 막지 않는다.
      this.warnOnce('redis.url 이 없어 하루 한도가 적용되지 않는다');
      return true;
    }

    const client = await this.connect();
    if (!client) {
      // 붙기로 돼 있는데 못 붙었다 — 고장이다. 셀 수 없으면 쓰지 못하게 한다.
      this.logger.error(`quota unavailable (redis down): ${scope}`);
      return false;
    }

    // 예: `develop:quota:ai-search:app:7:2026-08-05`
    const key = `${this.prefix}quota:${scope}:${today()}`;
    try {
      const used = await client.incr(key);
      // 첫 증가에만 수명을 건다. 매번 걸면 자정이 계속 미뤄져 하루가 안 끝난다.
      if (used === 1) {
        await client.expire(key, KEY_TTL_SEC);
      }
      if (used > limit) {
        // 넘긴 직후 한 번만 시끄럽게 남긴다. 매 요청 찍으면 로그가 그것으로 덮인다.
        if (used === limit + 1) {
          this.logger.error(`daily quota exhausted: ${scope} (limit ${limit})`);
        }
        return false;
      }
      return true;
    } catch (cause) {
      // INCR 이 실패하면 이 요청을 셌는지조차 모른다. 세지 못한 호출은 내보내지 않는다.
      this.logger.error(`quota check failed: ${String(cause)}`);
      return false;
    }
  }

  /** 같은 경고로 로그를 덮지 않는다. 구성 문제라 한 번 알면 충분하다. */
  private warnOnce(message: string): void {
    if (this.warned) {
      return;
    }
    this.warned = true;
    this.logger.warn(message);
  }

  /** 접속을 한 번만 만들어 재사용한다. 요청마다 붙으면 그게 더 비싸다. */
  private async connect(): Promise<RedisClientType | undefined> {
    if (this.client?.isReady) {
      return this.client;
    }
    if (!this.url) {
      return undefined;
    }
    this.connecting ??= (async () => {
      try {
        const client: RedisClientType = createClient({ url: this.url });
        // 핸들러가 없으면 접속 오류가 'error' 이벤트로 터져 프로세스를 죽인다.
        client.on('error', (error: unknown) => {
          this.logger.warn(`redis error: ${String(error)}`);
        });
        await client.connect();
        this.client = client;
        return client;
      } catch (cause) {
        this.logger.warn(`redis connect failed: ${String(cause)}`);
        return undefined;
      } finally {
        // 실패했으면 다음 요청이 다시 시도할 수 있게 놓아 준다.
        this.connecting = undefined;
      }
    })();
    return this.connecting;
  }
}

/** `YYYY-MM-DD`(KST). 날짜가 바뀌면 키가 갈려 카운터가 저절로 리셋된다. */
function today(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
