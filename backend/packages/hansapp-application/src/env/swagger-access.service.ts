import { Injectable, Logger } from '@nestjs/common';

import { EnvSwaggerAllowedIpRepository } from './env-swagger-allowed-ip.repository';
import { matchesAllowedIp, parseIp } from './ip-match';

/**
 * 목록 캐시 수명. 짧게 잡은 이유는 **IP 추가가 재배포 없이 먹혀야** 하기 때문이다.
 * 코드표 캐시(HealthcareCodeCache 등)처럼 부팅 때 한 번 올리고 끝내면 "DB 에 넣었는데
 * 여전히 막힌다" 가 되고, 그때 할 수 있는 게 재시작뿐이다.
 */
const CACHE_TTL_MS = 60_000;

/**
 * Swagger 문서(/docs, /openapi.json)를 볼 수 있는 IP 인지 판정한다.
 *
 * [실패 방향]
 * 판정 불가는 전부 **거부**다(fail-closed). IP 를 못 읽거나, 목록을 한 번도 못 읽었거나,
 * 목록이 비어 있으면 아무도 통과하지 못한다. 문서가 안 보이는 건 불편이고
 * 잘못 열리는 건 사고라, 애매할 때 닫는 쪽으로 기울인다.
 *
 * 단 하나 예외가 갱신 실패다 — 이미 목록을 갖고 있는데 새로 읽기가 실패하면 **직전 목록을
 * 그대로 쓴다.** DB 가 순간 흔들릴 때마다 열려 있던 문서가 닫히는 편이 더 나쁘다.
 */
@Injectable()
export class SwaggerAccessService {
  private readonly logger = new Logger(SwaggerAccessService.name);

  private patterns: string[] | undefined;
  private expiresAt = 0;
  /** 진행 중인 갱신. /docs 한 번에 몰리는 동시 요청이 DB 를 N번 때리지 않게 묶는다. */
  private refreshing: Promise<void> | undefined;

  constructor(private readonly repository: EnvSwaggerAllowedIpRepository) {}

  async isAllowed(clientIp: string): Promise<boolean> {
    const parsed = parseIp(clientIp);
    if (parsed === null) {
      // 프록시 헤더가 비었거나 이상한 값이 온 경우. 통과시키면 헤더를 지운 요청이 다 뚫린다.
      this.logger.warn(`Rejected Swagger access: unparsable client IP`);
      return false;
    }

    const patterns = await this.getPatterns();
    if (patterns === undefined || patterns.length === 0) return false;

    return patterns.some((pattern) => matchesAllowedIp(parsed, pattern));
  }

  private async getPatterns(): Promise<string[] | undefined> {
    if (this.patterns !== undefined && Date.now() < this.expiresAt) {
      return this.patterns;
    }
    await (this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    }));
    return this.patterns;
  }

  private async refresh(): Promise<void> {
    try {
      const rows = await this.repository.findEnabled();
      this.patterns = rows.map((row) => row.ipAddress);
      this.expiresAt = Date.now() + CACHE_TTL_MS;
    } catch (error) {
      // 직전 목록이 있으면 유지한다(위 [실패 방향] 참고). TTL 은 밀어 두되 짧게 잡아
      // DB 가 돌아오면 곧 다시 시도한다.
      this.expiresAt = Date.now() + CACHE_TTL_MS;
      this.logger.error(
        `Failed to load Swagger IP allowlist${
          this.patterns === undefined ? ' (no cached list — denying all)' : ' (keeping cached list)'
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
