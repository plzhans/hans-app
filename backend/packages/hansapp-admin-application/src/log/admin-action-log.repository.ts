import { Injectable } from '@nestjs/common';
import { AdminLogAction, LogPrisma, PrismaLogService } from '@hansapp/data';
import type { AdminActionLog } from '@hansapp/data';

/** 조회 조건. 비어 있는 값은 조건에서 빠진다(기본은 전체 기간·전체 액션). */
export interface AdminActionLogFilter {
  /**
   * 이 관리자와 얽힌 기록. **한 일과 당한 일을 함께 본다.**
   *
   * 회원 로그에는 없는 방향이다 — 관리자는 남의 계정을 지우고 비밀번호를 다시 내므로,
   * "내가 무엇을 했나" 만큼이나 "누가 내 계정을 건드렸나" 가 되짚을 값이다.
   */
  readonly adminId: number;
  /** 이 시각부터(포함) */
  readonly from?: Date;
  /** 이 시각까지(포함) */
  readonly to?: Date;
  /** 고른 액션들. 비어 있으면 전부. */
  readonly actions?: AdminLogAction[];
}

/**
 * 관리자 행위 기록 조회 저장소. **로그 DB(PrismaLogService)를 읽는다.**
 *
 * 메인 DB 와 다른 커넥션이라 관리자 표와 조인할 수 없다 — admin_id 는 값으로만 들어 있다.
 * 그래서 지워진 계정의 이메일 같은 것은 적재 시점에 detail 에 함께 박아 둔다.
 */
@Injectable()
export class AdminActionLogRepository {
  constructor(private readonly prisma: PrismaLogService) {}

  /**
   * 한 페이지와 총건수를 **한 번에** 가져온다.
   * 따로 부르면 그 사이에 새 기록이 쌓여 총건수와 행이 어긋난다.
   */
  listPage(
    filter: AdminActionLogFilter,
    skip: number,
    take: number,
  ): Promise<[AdminActionLog[], number]> {
    const where = buildWhere(filter);
    return this.prisma.$transaction([
      this.prisma.adminActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.adminActionLog.count({ where }),
    ]);
  }
}

function buildWhere(filter: AdminActionLogFilter): LogPrisma.AdminActionLogWhereInput {
  /*
    **OR 로 두 인덱스를 걸친다.** (admin_id, created_at)·(target_admin_id, created_at)
    각각은 인덱스를 타지만 OR 로 묶이면 index_merge 나 정렬이 붙는다 — 관리자 로그는
    계정이 몇 개뿐이라 전체 건수가 작아 그 값을 감수한다. 회원 로그(user_id 하나)와
    다른 선택인 이유는 규모가 다르기 때문이다.
  */
  const where: LogPrisma.AdminActionLogWhereInput = {
    OR: [{ adminId: filter.adminId }, { targetAdminId: filter.adminId }],
  };

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
