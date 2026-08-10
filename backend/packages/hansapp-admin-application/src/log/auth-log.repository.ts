import { Injectable } from '@nestjs/common';
import { LogPrisma, PrismaLogService } from '@hansapp/data';
import type { AuthLogAction, AuthLogResult, UserAuthLog } from '@hansapp/data';

/** 조회 조건. 비어 있는 값은 조건에서 빠진다. */
export interface AuthLogFilter {
  /** 이 시각부터(포함) */
  readonly from?: Date;
  /** 이 시각까지(포함) */
  readonly to?: Date;
  /** 고른 액션들. 비어 있으면 전부. */
  readonly actions?: AuthLogAction[];
  /** 성공만 / 실패만. 없으면 둘 다. */
  readonly result?: AuthLogResult;
  /** 접속 IP 정확 일치 */
  readonly ip?: string;
  /** 회원번호 */
  readonly userId?: number;
  /** 회원이 특정되지 않은 것만(미가입 이메일로의 시도 등) */
  readonly anonymousOnly?: boolean;
}

/**
 * 전역 인증 기록 조회 저장소.
 *
 * **회원 상세의 탭과 무엇이 다른가.** 거기는 회원을 특정하고 들어가 `(user_id, created_at)`
 * 인덱스를 탄다. 여기는 대상을 가리지 않고 기간으로 훑으므로 `(created_at)` 을 탄다 —
 * 그래서 **기간이 늘 조건에 있어야 한다**(서비스가 강제한다).
 *
 * 그리고 여기서만 보이는 것이 있다: **user_id 가 null 인 행.** 없는 계정으로의 로그인
 * 시도가 그렇게 남는데, 어느 회원에도 안 붙으므로 회원 상세에서는 영영 안 보인다.
 */
@Injectable()
export class AuthLogRepository {
  constructor(private readonly prisma: PrismaLogService) {}

  /**
   * 한 페이지와 총건수를 **한 번에** 가져온다.
   * 따로 부르면 그 사이에 새 이벤트가 쌓여 총건수와 행이 어긋난다.
   */
  listPage(
    filter: AuthLogFilter,
    skip: number,
    take: number,
  ): Promise<[UserAuthLog[], number]> {
    const where = buildWhere(filter);
    return this.prisma.$transaction([
      this.prisma.userAuthLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.userAuthLog.count({ where }),
    ]);
  }
}

function buildWhere(filter: AuthLogFilter): LogPrisma.UserAuthLogWhereInput {
  const where: LogPrisma.UserAuthLogWhereInput = {};

  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  if (filter.actions?.length) {
    where.action = { in: filter.actions };
  }
  if (filter.result) {
    where.result = filter.result;
  }
  if (filter.ip) {
    where.ip = filter.ip;
  }
  // 회원 지정과 "회원 없음" 은 같은 칸을 두고 다투므로, 지정이 있으면 그쪽이 이긴다.
  if (filter.userId !== undefined) {
    where.userId = filter.userId;
  } else if (filter.anonymousOnly) {
    where.userId = null;
  }

  return where;
}
