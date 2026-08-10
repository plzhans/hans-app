import { Injectable } from '@nestjs/common';
import { LogPrisma, PrismaLogService } from '@hansapp/data';
import type { LlmUsage } from '@hansapp/data';

/** 조회 조건. 비어 있는 값은 조건에서 빠진다. */
export interface LlmUsageLogFilter {
  /** 이 시각부터(포함) */
  readonly from?: Date;
  /** 이 시각까지(포함) */
  readonly to?: Date;
  /** 추적 id 정확 일치. 이것만 오면 기간 없이도 인덱스를 탄다. */
  readonly requestId?: string;
  /** 기능(예: hospital-search) */
  readonly feature?: string;
  /** 우리 Redis 캐시에서 나온 답만 / 실제 호출만 */
  readonly cached?: boolean;
  readonly appId?: number;
  readonly userId?: number;
}

/**
 * LLM 호출 이력 조회 저장소. 로그 DB(PrismaLogService)를 읽는다.
 *
 * **이 표를 읽는 첫 코드다.** 그동안 적재만 하고 꺼내 본 적이 없었다.
 *
 * [기간이 늘 조건에 있어야 하는 이유]
 * 인덱스가 `(created_at, app_id)`·`(created_at, user_id)`·`(request_id)` 다 —
 * **created_at 이 앞자리**라 기간이 빠지면 앞의 둘은 범위를 못 좁힌다. 회원·앱으로만
 * 거르는 조회는 사실상 전체 훑기가 된다. 그래서 서비스가 기간을 강제하고,
 * 예외는 request_id 하나뿐이다(그건 단독 인덱스가 있다).
 */
@Injectable()
export class LlmUsageLogRepository {
  constructor(private readonly prisma: PrismaLogService) {}

  /**
   * 한 페이지와 총건수를 **한 번에** 가져온다.
   * 따로 부르면 그 사이에 새 호출이 쌓여 총건수와 행이 어긋난다.
   */
  listPage(
    filter: LlmUsageLogFilter,
    skip: number,
    take: number,
  ): Promise<[LlmUsage[], number]> {
    const where = buildWhere(filter);
    return this.prisma.$transaction([
      this.prisma.llmUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.llmUsage.count({ where }),
    ]);
  }
}

function buildWhere(filter: LlmUsageLogFilter): LogPrisma.LlmUsageWhereInput {
  const where: LogPrisma.LlmUsageWhereInput = {};

  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  if (filter.requestId) {
    where.requestId = filter.requestId;
  }
  if (filter.feature) {
    where.feature = filter.feature;
  }
  if (filter.cached !== undefined) {
    where.cached = filter.cached;
  }
  if (filter.appId !== undefined) {
    where.appId = filter.appId;
  }
  if (filter.userId !== undefined) {
    where.userId = filter.userId;
  }

  return where;
}
