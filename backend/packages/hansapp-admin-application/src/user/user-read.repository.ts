import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, UserStatus } from '@hansapp/data';
import type { User, UserOAuth } from '@hansapp/data';

/** 목록 조회 조건. 비어 있는 값은 조건에서 빠진다. */
export interface UserListFilter {
  /** 이메일·이름 부분 일치. 공백만 있으면 없는 것으로 본다. */
  readonly keyword?: string;
  readonly status?: UserStatus;
}

/** 상세에 곁들이는 계정 활동 요약. */
export interface UserDetailRow {
  readonly user: User;
  readonly oauths: UserOAuth[];
  /** 살아 있는 로그인 세션 수(만료된 것은 뺀다). */
  readonly activeSessionCount: number;
  /** 이 회원이 소유·참여 중인 앱 수. */
  readonly appCount: number;
}

/**
 * 살아 있는 로그인 세션 한 줄.
 *
 * **secret 해시는 담지 않는다.** 식별자(sessionId)는 끊을 대상을 가리키는 데 쓰이지만,
 * 그것만으로는 로그인할 수 없다 — refresh token 은 `sid + secret` 이고 secret 은 해시로만
 * 저장된다. 해시가 새면 그 대조를 통과시킬 수 있으니 그쪽은 계속 담지 않는다.
 */
export interface UserSessionRow {
  readonly sessionId: number;
  readonly userAgent: string | null;
  readonly ip: string | null;
  /** "로그인 상태 유지" 를 켜고 만든 세션인가. */
  readonly persistent: boolean;
  readonly expiresAt: Date;
  /** 이 기기에서 로그인한 시각. */
  readonly createdAt: Date;
  /** 마지막 갱신(rotate) 시각. 사실상 최근 활동 시각이다. */
  readonly updatedAt: Date;
}

/**
 * 관리자용 회원 조회 저장소.
 *
 * **읽기 전용이다.** 회원 데이터를 고치는 것은 회원 본인의 통로(hansapp-api)가 하고, 여기서는
 * 들여다보기만 한다. 쓰기가 필요해지면 그때 무엇을 어디까지 허용할지 따로 정한다 —
 * 지금 열어 두면 "관리자니까 다 된다" 가 기본값이 되어 버린다.
 */
@Injectable()
export class UserReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 목록 한 페이지와 총건수를 **한 번에** 가져온다.
   *
   * 두 쿼리를 따로 부르면 그 사이에 가입/탈퇴가 끼어 총건수와 행이 어긋난다.
   * $transaction 으로 묶어 같은 스냅샷을 보게 한다.
   */
  listPage(filter: UserListFilter, skip: number, take: number): Promise<[User[], number]> {
    const where = buildWhere(filter);
    return this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        // 최근 가입 순. id 는 자동증가라 createdAt 과 순서가 같고 인덱스도 그대로 탄다.
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
  }

  /**
   * 이메일로 회원번호만 찾는다. **로그 조회가 쓴다.**
   *
   * 로그 DB 에는 회원번호만 있고 이메일이 없다(별도 DB 라 조인도 안 된다). 관리자는 번호가
   * 아니라 이메일로 사람을 찾으므로, 조회 전에 여기서 한 번 번호로 바꿔 준다.
   */
  async findIdByEmail(email: string): Promise<number | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * 회원번호들의 이메일. **로그 한 페이지를 받은 뒤 이름을 붙이는 데 쓴다.**
   *
   * 조인이 안 되니 로그를 먼저 읽고, 거기 나온 번호만 모아 한 번에 되묻는다.
   * 페이지 크기만큼만 물으므로(최대 100) 쿼리 하나로 끝난다.
   */
  findEmailsByIds(ids: number[]): Promise<{ id: number; email: string }[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true },
    });
  }

  /**
   * 상세. 회원 한 명에 딸린 것들을 같이 센다.
   *
   * 세션·앱은 여기서 **개수만** 센다 — 개요가 답할 것은 "이 계정이 활동 중인가" 다.
   * 기기 하나하나는 세션 탭(`listSessions`)이 맡는다.
   */
  async findDetail(id: number, now: Date): Promise<UserDetailRow | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    const [oauths, activeSessionCount, appCount] = await this.prisma.$transaction([
      this.prisma.userOAuth.findMany({
        where: { userId: id },
        orderBy: { id: 'asc' },
      }),
      this.prisma.userTokenSession.count({
        where: { userId: id, expiresAt: { gt: now } },
      }),
      this.prisma.appMember.count({ where: { userId: id } }),
    ]);

    return { user, oauths, activeSessionCount, appCount };
  }

  /**
   * 이 회원이 로그인해 둔 기기 목록. 최근 활동 순.
   *
   * **만료된 것은 뺀다.** 만료 행은 정리 배치가 치울 때까지 DB 에 남아 있을 뿐이라,
   * 그대로 보여 주면 개요의 세션 수와 줄 수가 어긋난다(그쪽도 같은 조건으로 센다).
   *
   * 페이지를 나누지 않는다 — 세션은 계정마다 상한이 있어 몇 줄로 끝난다.
   */
  listSessions(userId: number, now: Date): Promise<UserSessionRow[]> {
    return this.prisma.userTokenSession.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { updatedAt: 'desc' },
      // **고를 것만 고른다.** 엔티티를 통째로 실으면 secretHash 가 따라 올라온다.
      select: {
        sessionId: true,
        userAgent: true,
        ip: true,
        persistent: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

function buildWhere(filter: UserListFilter): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  const keyword = filter.keyword?.trim();
  if (keyword) {
    /*
      **접두 일치가 아니라 부분 일치(contains)다.** 관리자는 "가운데 이 글자가 들어간 계정" 을
      찾는 일이 잦아 접두 일치로는 못 쓴다. 대신 인덱스를 못 타므로 회원 수가 커지면 느려진다 —
      그때는 전문 검색으로 옮긴다(지금 규모에서 미리 만들 이유는 없다).
    */
    where.OR = [{ email: { contains: keyword } }, { name: { contains: keyword } }];
  }

  if (filter.status) {
    where.status = filter.status;
  }

  return where;
}
