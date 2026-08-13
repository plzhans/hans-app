import { Injectable } from '@nestjs/common';
import { AdminRole, AdminStatus, AdminUser, PrismaService } from '@hansapp/data';

/** 지운 계정을 빼는 조건. 조회하는 자리마다 다시 적지 않는다. */
const LIVE = { deletedAt: null };

/**
 * 관리자 계정 저장소.
 *
 * **기본이 "살아 있는 계정" 이다.** 지운 계정도 행으로 남아 있어서(소프트 삭제), 조건을
 * 빠뜨린 조회 하나가 곧바로 "지운 사람이 로그인된다" 가 된다 — 그래서 지운 것까지 보는
 * 메서드만 이름에 그 사실을 적는다(`…WithDeleted`). 그걸 쓰는 곳은 콘솔의 목록·상세뿐이다.
 */
@Injectable()
export class AdminUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<AdminUser | null> {
    // 이제 email 만으로는 유일하지 않다(지운 계정이 같은 주소를 들고 남는다).
    return this.prisma.adminUser.findFirst({ where: { email, ...LIVE } });
  }

  findById(id: number): Promise<AdminUser | null> {
    return this.prisma.adminUser.findFirst({ where: { id, ...LIVE } });
  }

  /** 지운 계정도 찾는다. **콘솔의 상세 화면 전용이다** — 인증 경로에서는 쓰지 않는다. */
  findByIdWithDeleted(id: number): Promise<AdminUser | null> {
    return this.prisma.adminUser.findUnique({ where: { id } });
  }

  /** 살아 있는 계정. 번호 순. */
  listAll(): Promise<AdminUser[]> {
    return this.prisma.adminUser.findMany({ where: LIVE, orderBy: { id: 'asc' } });
  }

  /** 지운 계정만. **최근에 지운 것이 앞이다** — 되짚을 때 찾는 것이 대개 방금 지운 계정이다. */
  listDeleted(): Promise<AdminUser[]> {
    return this.prisma.adminUser.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /** 계정이 하나라도 있는가. 부팅 시 기본 계정 생성 여부를 정하는 데 쓴다. */
  count(): Promise<number> {
    return this.prisma.adminUser.count({ where: LIVE });
  }

  create(input: {
    email: string;
    password: string;
    name: string | null;
    role: AdminRole;
    mustChangePassword: boolean;
  }): Promise<AdminUser> {
    return this.prisma.adminUser.create({ data: input });
  }

  /** 이 등급인 계정 수. **마지막 시스템 관리자를 지키는 데 쓴다.** */
  countByRole(role: AdminRole): Promise<number> {
    return this.prisma.adminUser.count({ where: { role, ...LIVE } });
  }

  /**
   * 비밀번호를 바꾼다. **변경 강제 플래그를 함께 정한다** — 둘을 따로 쓰면
   * 한쪽만 갱신되는 순간이 생기고, 그 창에서는 강제가 풀리거나 영영 안 풀린다.
   */
  updatePassword(id: number, password: string, mustChangePassword: boolean): Promise<AdminUser> {
    return this.prisma.adminUser.update({
      where: { id },
      data: { password, mustChangePassword },
    });
  }

  /**
   * 이메일·표시 이름·등급 변경. 준 항목만 바꾼다.
   *
   * **이메일은 로그인 식별자다.** 중복은 DB 의 unique 제약이 마지막으로 막지만, 그 전에
   * 서비스가 먼저 확인해 사람이 읽을 수 있는 오류로 돌려준다.
   *
   * **등급을 누가 어디까지 바꿀 수 있는지는 서비스가 본다** — 저장소는 시키는 대로 쓴다.
   */
  updateProfile(
    id: number,
    input: {
      email?: string;
      name?: string | null;
      role?: AdminRole;
      language?: string;
      timeZone?: string;
    },
  ): Promise<AdminUser> {
    return this.prisma.adminUser.update({ where: { id }, data: input });
  }

  /**
   * 계정을 지운다. **행은 남기고 지운 표시만 한다.**
   *
   * **세션은 함께 사라지지 않는다** — FK Cascade 는 행이 지워질 때 도는 것이라, 부르는
   * 쪽이 먼저 끊어 놓아야 한다(AdminAccountService.remove).
   *
   * `deletedSeq` 에 자기 번호를 박아 (email, deletedSeq) 유일 제약에서 빠져나온다 —
   * 같은 주소로 계정을 다시 만들 수 있어야 하기 때문이다.
   */
  softDelete(id: number, at: Date): Promise<AdminUser> {
    return this.prisma.adminUser.update({
      where: { id },
      data: { deletedAt: at, deletedSeq: id },
    });
  }

  updateStatus(id: number, status: AdminStatus): Promise<AdminUser> {
    return this.prisma.adminUser.update({ where: { id }, data: { status } });
  }

  /**
   * 언어·타임존 변경. 준 항목만 바꾼다.
   * **국가(countryCode)는 없다** — 관리자는 한국 기준으로 굳혀 두고 고치지 않는다.
   */
  updateLocale(id: number, input: { language?: string; timeZone?: string }): Promise<AdminUser> {
    return this.prisma.adminUser.update({ where: { id }, data: input });
  }

  touchLastLogin(id: number, at: Date): Promise<void> {
    return this.prisma.adminUser
      .update({ where: { id }, data: { lastLoginAt: at } })
      .then(() => undefined);
  }
}
