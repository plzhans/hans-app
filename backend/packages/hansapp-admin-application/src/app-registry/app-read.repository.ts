import { Injectable } from '@nestjs/common';
import { AppStatus, Prisma, PrismaService } from '@hansapp/data';
import type { App, AppApiKey, AppClient, User } from '@hansapp/data';

/** 목록 조회 조건. 비어 있는 값은 조건에서 빠진다. */
export interface AppListFilter {
  /** 앱 이름 부분 일치. 공백만 있으면 없는 것으로 본다. */
  readonly keyword?: string;
  readonly status?: AppStatus;
  /**
   * 소프트 삭제된 앱을 포함할지. **기본은 제외다.**
   * 관리 화면에서 평소 보고 싶은 것은 살아 있는 앱이고, 지워진 것은 따로 찾아본다.
   */
  readonly includeDeleted?: boolean;
}

/** 목록 한 줄에 필요한 것 — 앱 + 소유자 + 하위 발급물 개수. */
export interface AppListRow {
  readonly app: App;
  /** 소유자(AppMember role=OWNER). 없으면 null — 회원이 탈퇴하면 멤버 행이 Cascade 로 사라진다. */
  readonly owner: Pick<User, 'id' | 'email' | 'name'> | null;
  readonly apiKeyCount: number;
  readonly clientCount: number;
  readonly memberCount: number;
}

export interface AppDetailRow extends AppListRow {
  readonly apiKeys: AppApiKey[];
  readonly clients: AppClient[];
  readonly members: {
    readonly role: string;
    readonly joinedAt: Date;
    readonly user: Pick<User, 'id' | 'email' | 'name'> | null;
  }[];
}

/** 소유자·회원 정보를 고르는 select. 관리 화면에 필요한 것만 뽑는다. */
const USER_SELECT = { id: true, email: true, name: true } as const;

/**
 * 관리자용 앱 조회 저장소. **읽기 전용이다.**
 *
 * 앱의 승인·차단은 별도 기능이라 여기 두지 않는다 — 열어 두면 "관리자니까 다 된다" 가
 * 기본값이 되고, 승인 흐름(reviewRequestedAt·rejectionReason)을 어디서 다루는지가 흐려진다.
 */
@Injectable()
export class AppReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 목록 한 페이지와 총건수를 한 번에 가져온다.
   *
   * **하위 개수는 `_count` 로 DB 가 센다.** 앱마다 키·클라이언트를 따로 조회하면
   * 20행이면 40번을 더 나간다(N+1).
   */
  async listPage(
    filter: AppListFilter,
    skip: number,
    take: number,
  ): Promise<[AppListRow[], number]> {
    const where = buildWhere(filter);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.app.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: {
          // 소유자 한 명만. 멤버 전체를 끌고 오면 목록에서 쓰지도 않을 행이 붙는다.
          members: {
            where: { role: 'OWNER' },
            take: 1,
            select: { user: { select: USER_SELECT } },
          },
          _count: { select: { apiKeys: true, clients: true, members: true } },
        },
      }),
      this.prisma.app.count({ where }),
    ]);

    return [rows.map(toListRow), total];
  }

  async findDetail(id: number): Promise<AppDetailRow | null> {
    const row = await this.prisma.app.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { id: 'asc' },
          select: {
            role: true,
            createdAt: true,
            user: { select: USER_SELECT },
          },
        },
        apiKeys: { orderBy: { id: 'asc' } },
        clients: { orderBy: { id: 'asc' } },
        _count: { select: { apiKeys: true, clients: true, members: true } },
      },
    });
    if (!row) return null;

    const owner = row.members.find((m) => m.role === 'OWNER')?.user ?? null;

    return {
      app: row,
      owner,
      apiKeyCount: row._count.apiKeys,
      clientCount: row._count.clients,
      memberCount: row._count.members,
      apiKeys: row.apiKeys,
      clients: row.clients,
      members: row.members.map((m) => ({
        role: m.role,
        joinedAt: m.createdAt,
        user: m.user,
      })),
    };
  }
}

type ListQueryRow = App & {
  members: { user: Pick<User, 'id' | 'email' | 'name'> | null }[];
  _count: { apiKeys: number; clients: number; members: number };
};

function toListRow(row: ListQueryRow): AppListRow {
  return {
    app: row,
    owner: row.members[0]?.user ?? null,
    apiKeyCount: row._count.apiKeys,
    clientCount: row._count.clients,
    memberCount: row._count.members,
  };
}

function buildWhere(filter: AppListFilter): Prisma.AppWhereInput {
  const where: Prisma.AppWhereInput = {};

  const keyword = filter.keyword?.trim();
  if (keyword) {
    // 앱 이름과 소유자 이메일 둘 다 본다 — "이 사람이 만든 앱" 을 찾는 일이 잦다.
    where.OR = [
      { name: { contains: keyword } },
      { members: { some: { user: { email: { contains: keyword } } } } },
    ];
  }

  if (filter.status) {
    where.status = filter.status;
  }

  // 소프트 삭제는 status 와 별개 축이다(DISABLED 여도 안 지워졌을 수 있다).
  if (!filter.includeDeleted) {
    where.deletedAt = null;
  }

  return where;
}
