import { Injectable } from '@nestjs/common';
import { LogPrisma, PrismaLogService, AuthLogAction } from '@hansapp/data';
import type { UserAuthLog } from '@hansapp/data';

/** 조회 조건. 비어 있는 값은 조건에서 빠진다(기본은 전체 기간·전체 액션). */
export interface UserAuthLogFilter {
  readonly userId: number;
  /** 이 시각부터(포함) */
  readonly from?: Date;
  /** 이 시각까지(포함) */
  readonly to?: Date;
  /** 고른 액션들. 비어 있으면 전부. */
  readonly actions?: AuthLogAction[];
}

/**
 * 회원 활동 기록 조회 저장소. **로그 DB(PrismaLogService)를 읽는다.**
 *
 * 메인 DB 와 다른 커넥션이라 회원 표와 조인할 수 없다 — user_id 는 값으로만 들어 있다.
 * 회원 한 명을 이미 특정하고 들어오는 화면이라 이름·이메일을 붙일 필요도 없다
 * (전역 로그 화면이 생기면 그때 id 를 모아 메인 DB 에 되물어 붙인다).
 */
@Injectable()
export class UserAuthLogRepository {
  constructor(private readonly prisma: PrismaLogService) {}

  /**
   * 한 페이지와 총건수를 **한 번에** 가져온다.
   * 따로 부르면 그 사이에 새 이벤트가 쌓여 총건수와 행이 어긋난다.
   */
  listPage(
    filter: UserAuthLogFilter,
    skip: number,
    take: number,
  ): Promise<[UserAuthLog[], number]> {
    const where = buildWhere(filter);
    return this.prisma.$transaction([
      this.prisma.userAuthLog.findMany({
        where,
        // (user_id, created_at) 인덱스를 정렬까지 그대로 탄다.
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.userAuthLog.count({ where }),
    ]);
  }
}

function buildWhere(filter: UserAuthLogFilter): LogPrisma.UserAuthLogWhereInput {
  const where: LogPrisma.UserAuthLogWhereInput = { userId: filter.userId };

  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }

  if (filter.actions?.length) {
    where.action = { in: filter.actions };
  }

  return where;
}
