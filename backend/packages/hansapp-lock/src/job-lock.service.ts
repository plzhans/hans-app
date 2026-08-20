import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from '@redis/client';
import type { ConfigSource } from '@hansapp/common';

/** 락을 못 잡았을 때. 실행하지 않았다는 뜻이다. */
export const LOCK_NOT_ACQUIRED = Symbol('LOCK_NOT_ACQUIRED');
export type LockNotAcquired = typeof LOCK_NOT_ACQUIRED;

/**
 * 락 수명. **이 시간이 크래시 회수를 대신한다.**
 *
 * 프로세스가 SIGKILL·OOM 으로 죽으면 해제 코드가 안 돈다. 그래도 TTL 이 지나면 Redis 가
 * 알아서 지우므로 다음 실행이 그대로 잡는다 — 그래서 "굳은 락을 사람이 푸는" 절차가 없다.
 */
const TTL_MS = 60_000;

/**
 * 갱신 주기. TTL 의 1/3 이다.
 *
 * 절반으로 잡으면 GC 정지나 순간적인 Redis 지연 한 번에 락을 놓친다. 세 번 놓쳐야
 * 풀리도록 여유를 준다 — 놓치면 남이 같은 잡을 동시에 돌리게 되므로 보수적으로 잡는다.
 */
const RENEW_MS = TTL_MS / 3;

/**
 * 내 토큰일 때만 TTL 을 늘린다.
 *
 * **토큰을 대조하지 않으면 안 된다.** 내가 멈춰 있는 사이 TTL 이 끝나고 남이 락을 새로
 * 잡았을 수 있는데, 그때 무조건 늘리면 남의 락을 내가 연장해 버린다.
 */
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0
`;

/** 내 토큰일 때만 지운다. 위와 같은 이유 — 남의 락을 풀면 안 된다. */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/**
 * 잡 이름 기준 분산 락.
 *
 * **업무 테이블을 뮤텍스로 쓰지 않는다.** 예전에는 프로세스 메모리의 Set 하나가 전부라
 * 인스턴스가 둘이면 그냥 뚫렸다. 상태 열(batch_job.status)에 조건부 갱신을 걸어 대신하는
 * 방법도 있지만, 그러면 도메인 데이터가 락 노릇을 겸하게 되고 크래시로 굳었을 때
 * 사람이 손으로 푸는 절차가 따라붙는다. 락은 락으로 둔다(자바의 ShedLock 과 같은 자리).
 *
 * ## 어떻게 도나
 *
 *   획득  SET <키> <토큰> NX PX 60000   — 원자적. 이미 있으면 실패한다
 *   갱신  20초마다 PEXPIRE (토큰 일치할 때만)
 *   해제  DEL (토큰 일치할 때만)
 *
 * ## Redis 가 없으면 돌지 않는다
 *
 * **미설정도 다운과 똑같이 취급한다.** 락의 목적이 단일 실행 보장인데 못 잡은 채로 돌면
 * 그 보장이 사라진다. 적재는 하루 걸러도 다음 회차가 이어받지만, 두 인스턴스가 같은
 * 서비스키로 동시에 받으면 일일 한도를 두 배로 태우고 되돌릴 방법이 없다.
 */
@Injectable()
export class JobLockService implements OnModuleDestroy {
  private readonly logger = new Logger(JobLockService.name);
  private readonly url?: string;

  /**
   * 키 앞머리.
   *
   * **환경 이름(env)이 아니라 대상 DB 로 나눈다.** 락은 "같은 데이터를 만지는 프로세스"
   * 끼리 배타적이어야 하는데, env 로 나누면 그 경계가 데이터 경계와 어긋난다 —
   * local 과 develop 이 같은 DB(develop_hansapp)를 보는데 키가
   * `local:…` / `develop:…` 로 갈려 **둘 다 락을 잡고 동시에 돌았다.** 실제로 그 사고가 났다.
   *
   * 캐시나 카운터는 env 로 나누는 게 맞다(그쪽은 환경마다 값이 달라야 한다). 락은 반대다 —
   * 지키려는 것이 DB 안의 데이터라 **네임스페이스도 그 DB 여야** 한다.
   */
  private readonly prefix: string;

  private client?: RedisClientType;
  private connecting?: Promise<RedisClientType | undefined>;

  constructor(source: ConfigSource) {
    this.url = source.getUrlOrDefault('redis.url') || undefined;
    this.prefix = `batch:lock:${targetOf(source.getUrl('database.url'))}:`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }

  /**
   * 락을 잡고 실행한다. 못 잡으면 **실행하지 않고** LOCK_NOT_ACQUIRED 를 돌려준다.
   *
   * 예외가 나도 락은 푼다 — 안 그러면 실패한 잡이 TTL 만큼 다음 회차를 막는다.
   */
  async withLock<T>(name: string, body: () => Promise<T>): Promise<T | LockNotAcquired> {
    const client = await this.connect();
    if (!client) {
      // 여기 오면 락 자체를 걸 수 없다. 돌리지 않는 것이 이 서비스의 계약이다.
      return LOCK_NOT_ACQUIRED;
    }

    const key = `${this.prefix}${name}`;
    // 이 실행의 주인임을 증명하는 값. 해제·갱신 때 이것으로 대조한다.
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let acquired: string | null;
    try {
      acquired = await client.set(key, token, { NX: true, PX: TTL_MS });
    } catch (error) {
      this.logger.error(`lock acquire failed (${name}): ${describe(error)}`);
      return LOCK_NOT_ACQUIRED;
    }

    if (acquired === null) {
      this.logger.warn(`${name}: already locked by another runner`);
      return LOCK_NOT_ACQUIRED;
    }

    const renew = setInterval(() => {
      void client
        .eval(RENEW_SCRIPT, { keys: [key], arguments: [token, String(TTL_MS)] })
        .then((held) => {
          // 0 이면 락이 내 것이 아니다 — TTL 을 놓쳐 남이 가져갔다는 뜻이라 알아야 한다.
          if (held === 0) {
            this.logger.error(`${name}: lost the lock while running`);
          }
        })
        .catch((error: unknown) => {
          // 한 번 실패해도 다음 주기가 있다. TTL 안에 회복되면 문제없다.
          this.logger.warn(`lock renew failed (${name}): ${describe(error)}`);
        });
    }, RENEW_MS);
    // 락 갱신 타이머가 프로세스를 붙잡으면 안 된다 — --once 는 끝나면 나가야 한다.
    renew.unref?.();

    try {
      return await body();
    } finally {
      clearInterval(renew);
      try {
        await client.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] });
      } catch (error) {
        // 못 풀어도 TTL 이 지나면 사라진다. 다음 회차가 최대 60초 밀릴 뿐이다.
        this.logger.warn(`lock release failed (${name}): ${describe(error)}`);
      }
    }
  }

  /** 락을 걸 수 있는 상태인가. 부팅 로그에 한 줄 남기는 용도다. */
  get configured(): boolean {
    return this.url !== undefined;
  }

  private async connect(): Promise<RedisClientType | undefined> {
    if (!this.url) {
      this.logger.error(
        'redis.url is not set — jobs do not run without a lock (single-run cannot be guaranteed)',
      );
      return undefined;
    }
    if (this.client?.isReady) {
      return this.client;
    }
    // 동시에 여러 잡이 붙어도 연결은 하나만 만든다.
    this.connecting ??= this.open();
    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async open(): Promise<RedisClientType | undefined> {
    try {
      const client: RedisClientType = createClient({ url: this.url });
      // 연결이 끊겼다는 사실은 알아야 한다. 재연결은 클라이언트가 알아서 한다.
      client.on('error', (error: unknown) => {
        this.logger.warn(`redis error: ${describe(error)}`);
      });
      await client.connect();
      this.client = client;
      return client;
    } catch (error) {
      this.logger.error(`redis connect failed: ${describe(error)}`);
      return undefined;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * DB 접속 주소에서 **어느 데이터베이스인가**만 뽑는다. 예: `10.1.0.144:3306/develop_hansapp`
 *
 * 계정·비밀번호·쿼리 파라미터는 뺀다 — 같은 DB 를 다른 계정으로 붙어도 같은 락을 봐야 하고,
 * 무엇보다 비밀번호가 Redis 키에 남으면 안 된다.
 *
 * 주소를 못 읽으면 그대로 쓴다. 락이 안 걸리는 것보다 이상한 키로라도 걸리는 편이 낫다.
 */
function targetOf(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return databaseUrl;
  }
}
