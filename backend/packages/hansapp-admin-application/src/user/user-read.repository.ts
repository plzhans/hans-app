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
  listPage(
    filter: UserListFilter,
    skip: number,
    take: number,
  ): Promise<[User[], number]> {
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
   * 상세. 회원 한 명에 딸린 것들을 같이 센다.
   *
   * 세션·앱은 목록을 내려주지 않고 **개수만** 센다 — 상세 화면이 보여줄 것은 "이 계정이
   * 활동 중인가" 이지 세션 하나하나가 아니고, 세션 식별자는 굳이 화면에 흘릴 값이 아니다.
   */
  async findDetail(id: number, now: Date): Promise<UserDetailRow | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    const [oauths, activeSessionCount, appCount] =
      await this.prisma.$transaction([
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
    where.OR = [
      { email: { contains: keyword } },
      { name: { contains: keyword } },
    ];
  }

  if (filter.status) {
    where.status = filter.status;
  }

  return where;
}
