import { Inject, Injectable } from '@nestjs/common';
import { createClient } from '@redis/client';
import { PrismaLogService, PrismaService } from '@hansapp/data';
import { ElasticsearchService } from '@hansapp/search';

import { HEALTH_CONFIG, type HealthConfig } from './health.config';

/** 점검 대상 하나의 결과. */
export interface HealthCheckResult {
  /** 로그에 그대로 찍히는 이름(예: MySQL(main)). */
  readonly name: string;
  readonly status: 'ok' | 'skipped' | 'failed';
  /** 건너뛰거나 실패한 이유. 성공이면 없다. */
  readonly reason?: string;
}

/** 못 붙은 걸 오래 기다리지 않는다. TCP 는 SYN 재시도로 수십 초까지 매달린다. */
const CHECK_TIMEOUT_MS = 5_000;

async function withTimeout<T>(name: string, task: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${CHECK_TIMEOUT_MS}ms 안에 응답 없음`)),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 의존 인프라(MySQL·Redis·Elasticsearch)에 실제로 붙는지 확인한다.
 *
 * **판정만 하고 아무것도 결정하지 않는다** — 결과를 돌려줄 뿐, 죽일지 말지는 부른 쪽 몫이다.
 * 서버는 부팅을 중단하지만 CLI 는 같은 상황에서도 계속 돌아야 하는 등, 무엇이 치명적인지는
 * 실행 주체마다 다르기 때문이다.
 *
 * **하나가 실패해도 나머지를 계속 본다.** 먼저 걸린 하나에서 멈추면 재시작을 세 번 해야
 * 문제 세 개를 알게 된다 — 컨테이너가 재시작으로 인프라를 기다리는 배포에서는 특히 나쁘다.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prismaLog: PrismaLogService,
    private readonly search: ElasticsearchService,
    @Inject(HEALTH_CONFIG) private readonly config: HealthConfig,
  ) {}

  /** 전부 점검하고 결과를 돌려준다. 던지지 않는다 — 실패도 결과에 담긴다. */
  async checkAll(): Promise<HealthCheckResult[]> {
    return Promise.all([
      // 연결만이 아니라 쿼리까지 돌린다. Prisma 는 부팅 때 이미 $connect 했지만,
      // 계정 권한이나 DB 이름이 틀린 건 첫 쿼리에서야 드러난다.
      // 메인·로그는 접속 정보가 따로라 한쪽만 살아 있을 수 있어 각각 본다.
      this.check('MySQL(main)', () => this.prisma.$queryRaw`SELECT 1`),
      this.check('MySQL(log)', () => this.prismaLog.$queryRaw`SELECT 1`),
      this.checkRedis(),
      // ES 클라이언트도 지연 연결이라 ping 을 날려야 살았는지 알 수 있다.
      this.check('Elasticsearch', () => this.search.client.ping()),
    ]);
  }

  /**
   * Redis 점검. 캐시는 **지연 연결**이라 여기서 보지 않으면 죽어 있어도 그대로 뜨고,
   * 캐시 미스처럼 조용히 넘어가 원인이 요청 시점에야 드러난다.
   *
   * 점검용 커넥션은 따로 열고 바로 닫는다. 캐시(keyv)가 쓰는 커넥션을 빌리려면 캐시 구현에
   * 손을 넣어야 하는데, 그 대가로 얻는 게 커넥션 하나 아끼는 것뿐이다.
   */
  private async checkRedis(): Promise<HealthCheckResult> {
    const url = this.config.redisUrl;
    if (!url) {
      return { name: 'Redis', status: 'skipped', reason: '미설정(redis.url)' };
    }

    // reconnectStrategy: false — 재접속을 끈다. 켜두면 못 붙어도 계속 재시도하며 매달려
    // 점검이 끝나지 않는다.
    const client = createClient({
      url,
      socket: { connectTimeout: CHECK_TIMEOUT_MS, reconnectStrategy: false },
    });
    // 이 핸들러가 없으면 접속 실패가 'error' 이벤트로 먼저 터져 프로세스를 죽인다.
    // 그러면 무엇이 실패했는지 결과에 못 담는다.
    client.on('error', () => {});
    try {
      return await this.check('Redis', async () => {
        await client.connect();
        await client.ping();
      });
    } finally {
      // 못 붙었으면 이미 닫혀 있고, 그 상태의 destroy() 는 ClientClosedError 를 던져
      // 진짜 원인을 덮는다.
      if (client.isOpen) {
        client.destroy();
      }
    }
  }

  private async check(name: string, probe: () => Promise<unknown>): Promise<HealthCheckResult> {
    try {
      await withTimeout(name, probe());
      return { name, status: 'ok' };
    } catch (error) {
      return {
        name,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
