import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from '@redis/client';
import type { ConfigSource } from '@hansapp/common';

/**
 * 통이 언제 비워지는가.
 *
 *   `day`      자정(KST)에 리셋
 *   `month`    달이 바뀌면 리셋
 *   `balance`  안 비워진다 — 충전해서 쓰는 몫
 */
export type QuotaWindow = 'day' | 'month' | 'balance';

/** 걸어 둘 통 하나. `limit` 이 0 이하면 그 통은 없는 것으로 본다. */
export interface QuotaBucket {
  readonly window: QuotaWindow;
  readonly limit: number;
}

/** 통 하나의 현재 상태. */
export interface QuotaState {
  readonly window: QuotaWindow;
  readonly used: number;
  readonly limit: number;
}

/** reserve 결과. `states` 는 Redis 를 못 읽었으면 비어 있다. */
export interface QuotaCheck {
  readonly allowed: boolean;
  /** 막았다면 어느 통이 찼는지. 안내 문구가 "오늘" 과 "이번 달" 을 갈라 말해야 한다. */
  readonly blocked?: QuotaWindow;
  readonly states: QuotaState[];
}

/** 하루 경계. **KST 기준이다** — 한국 서비스라 "오늘" 이 사용자의 오늘과 같아야 한다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 통별 키 수명. 창이 닫힌 뒤에도 얼마간 남겨 둔다 — 경계 직전 증가분이 곧바로 사라지면
 * 그 몫이 안 세어진 것이 된다. `balance` 는 비워지면 안 되므로 수명을 안 건다.
 */
const TTL_SEC: Record<QuotaWindow, number | undefined> = {
  day: 36 * 60 * 60,
  // 달의 최대 길이(31일)보다 넉넉히. 1일에 처음 쓴 키도 말일까지 살아 있어야 한다.
  month: 40 * 24 * 60 * 60,
  balance: undefined,
};

/**
 * **토큰** 총량 계수기.
 *
 * **rate limit 과 다른 것을 막는다.** IP 당 분당 제한은 한 명이 얼마나 빨리 부르는지를
 * 묶을 뿐, **총액을 묶지 못한다** — IP 100 개면 분당 1,000 회고 그건 그대로 요금이다.
 * 게다가 모바일은 CGNAT 라 IP 하나를 수천 명이 공유해서, 조이면 정상 사용자가 먼저 막힌다.
 *
 * 세는 것은 **실제로 쓴 토큰 수**다(입력+출력). 호출 수가 아닌 이유는 호출 하나의 크기가
 * 제각각이어서다 — 요금이 붙는 단위로 세어야 상한이 요금과 맞는다.
 *
 * **통을 여러 개 겹쳐 걸 수 있다.** 한 scope 에 월 한도와 일 한도를 같이 두면, 월 예산이
 * 첫날에 다 타 버리는 일을 일 한도가 막는다 — 월만 걸면 하루 만에 바닥나고, 일만 걸면
 * 매일 꽉 채워 쓸 때 월 예산을 넘긴다. **먼저 차는 쪽이 막는다.**
 *
 * **Redis 다.** 인메모리로 두면 배포·재시작마다 카운터가 0 으로 돌아가, 공격자가 아니라
 * 우리 배포 주기가 상한을 무력화한다. INCRBY 라 동시 요청에도 안 샌다.
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
export class UsageQuotaService implements OnModuleDestroy {
  private readonly logger = new Logger(UsageQuotaService.name);
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
   * 쓸 자리가 남았는지 본다. **아무것도 깎지 않는다.**
   *
   * 토큰은 응답이 와야 알기 때문에 한 번에 못 깎는다 — 여기서 "남았나" 만 보고, 실제로 쓴
   * 양은 호출이 끝난 뒤 add 로 더한다. 그래서 **한 번은 한도를 넘길 수 있다**(마지막 호출이
   * 남은 양보다 크면). 상한은 요금을 묶는 안전망이지 정확한 계량기가 아니라 그 정도는
   * 받아들인다 — 정확히 맞추려면 최대치를 미리 잡아 뒀다가 실제값으로 되돌려야 하는데,
   * 그러면 상한 근처에서 멀쩡한 요청이 자꾸 거절된다.
   *
   * `scope` 가 계수 단위다. 누구 몫인지를 부르는 쪽이 정한다:
   *   `ai-search:app:7`     로그인 전 — 앱(appId)마다 한 통
   *   `ai-search:user:123`  로그인 후 — 사람마다 따로
   *
   * **셀 수 없으면 막는다(fail-closed).** 예외는 Redis 를 아예 안 쓰는 배포 —
   * 그건 고장이 아니라 구성이다.
   */
  async reserve(scope: string, buckets: QuotaBucket[]): Promise<QuotaCheck> {
    const active = buckets.filter((b) => b.limit > 0);
    if (active.length === 0) {
      return { allowed: true, states: [] };
    }
    if (!this.url) {
      // 구성상 Redis 가 없는 배포(로컬 등). 고장이 아니므로 막지 않는다.
      this.warnOnce('redis.url 이 없어 사용량 한도가 적용되지 않는다');
      return { allowed: true, states: [] };
    }

    const states = await this.read(scope, active);
    if (!states) {
      this.logger.error(`quota unavailable (redis down): ${scope}`);
      return { allowed: false, states: [] };
    }

    const full = states.find((s) => s.used >= s.limit);
    if (full) {
      // 넘긴 뒤로는 매 요청 찍히므로 한 줄로 짧게 남긴다.
      this.logger.warn(`quota exhausted: ${scope} ${full.window} (${full.used}/${full.limit})`);
      return { allowed: false, blocked: full.window, states };
    }
    return { allowed: true, states };
  }

  /**
   * 실제로 쓴 만큼 **모든 통에** 더한다. 호출이 끝난 뒤에 부른다.
   *
   * 실패는 삼킨다 — 이미 요금은 나갔고, 여기서 던져 봐야 사용자가 답을 못 받을 뿐이다.
   * 대신 로그로 남긴다(계수가 조용히 새면 상한이 헐거워진다).
   */
  async add(scope: string, amount: number, buckets: QuotaBucket[]): Promise<QuotaState[]> {
    const active = buckets.filter((b) => b.limit > 0);
    const step = Math.round(amount);
    if (step <= 0 || active.length === 0 || !this.url) {
      return [];
    }
    try {
      const client = await this.connect();
      if (!client) {
        return [];
      }
      // 통이 여러 개라 왕복도 여러 번이 된다. 한 번에 묶어 보낸다.
      const batch = client.multi();
      for (const bucket of active) {
        batch.incrBy(this.keyFor(scope, bucket.window), step);
      }
      const replies = await batch.exec();

      return active.map((bucket, i) => {
        const used = Number(replies[i] ?? 0);
        // 첫 증가에만 수명을 건다. 매번 걸면 경계가 계속 미뤄져 창이 안 닫힌다.
        if (used === step) {
          void this.setTtl(client, scope, bucket.window);
        }
        return { window: bucket.window, used, limit: bucket.limit };
      });
    } catch (cause) {
      this.logger.error(`quota add failed (${scope}): ${String(cause)}`);
      return [];
    }
  }

  /**
   * 지금까지 쓴 양만 **읽는다(깎지 않는다).**
   *
   * 사전 차단처럼 **아무 답도 안 준 요청**도 화면에 사용량을 보여줘야 해서 있다.
   * 거기서 add 를 부르면 준 것이 없는데 한도가 깎인다.
   *
   * **못 읽으면 undefined 다 — 빈 배열과 다르다.** 빈 배열은 "걸린 한도가 없다"(한도 0,
   * 또는 Redis 를 안 쓰는 구성)이고 undefined 는 "모른다"(계수기가 죽었다)다. 부르는 쪽이
   * 그 둘을 같게 다루면, 한도 없이 도는 배포와 계수기가 죽은 배포가 화면에서 똑같아진다.
   */
  async peek(scope: string, buckets: QuotaBucket[]): Promise<QuotaState[] | undefined> {
    const active = buckets.filter((b) => b.limit > 0);
    if (active.length === 0 || !this.url) {
      return [];
    }
    return this.read(scope, active);
  }

  /**
   * 통들을 한 번에 읽는다. 못 읽었으면 undefined 다 — **빈 배열과 구분해야 한다.**
   * 부르는 쪽이 "0 이다" 와 "모른다" 를 다르게 다뤄야 하기 때문이다(fail-closed).
   */
  private async read(scope: string, buckets: QuotaBucket[]): Promise<QuotaState[] | undefined> {
    try {
      const client = await this.connect();
      if (!client) {
        return undefined;
      }
      const raw = await client.mGet(buckets.map((b) => this.keyFor(scope, b.window)));
      const states = buckets.map((bucket, i) => ({
        window: bucket.window,
        used: Number(raw[i] ?? 0),
        limit: bucket.limit,
      }));
      // 하나라도 숫자가 아니면(누가 문자열을 덮어썼다면) 통째로 모르는 것으로 다룬다.
      return states.every((s) => Number.isFinite(s.used)) ? states : undefined;
    } catch (cause) {
      this.logger.error(`quota read failed (${scope}): ${String(cause)}`);
      return undefined;
    }
  }

  /** 수명 걸기. 실패해도 계수 자체는 이미 됐으므로 조용히 넘긴다. */
  private async setTtl(client: RedisClientType, scope: string, window: QuotaWindow): Promise<void> {
    const ttl = TTL_SEC[window];
    if (ttl === undefined) {
      return;
    }
    await client.expire(this.keyFor(scope, window), ttl).catch(() => undefined);
  }

  /**
   * 예: `develop:quota:ai-search:app:7:2026-08-06` (일)
   *     `develop:quota:ai-search:app:7:2026-08`    (월)
   *     `develop:quota:ai-search:user:123:balance` (잔액)
   *
   * **창 이름이 곧 리셋 장치다** — 날짜가 바뀌면 키가 갈려 카운터가 저절로 0 이 된다.
   */
  private keyFor(scope: string, window: QuotaWindow): string {
    return `${this.prefix}quota:${scope}:${suffix(window)}`;
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

/** 창을 여는 키 꼬리표. KST 기준이다. */
function suffix(window: QuotaWindow): string {
  if (window === 'balance') {
    return 'balance';
  }
  const kst = new Date(Date.now() + KST_OFFSET_MS).toISOString();
  return window === 'day' ? kst.slice(0, 10) : kst.slice(0, 7);
}
