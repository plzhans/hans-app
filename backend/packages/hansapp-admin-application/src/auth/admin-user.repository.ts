import { Injectable } from '@nestjs/common';
import { AdminRole, AdminStatus, AdminUser, PrismaService } from '@hansapp/data';

/** 관리자 계정 저장소. */
@Injectable()
export class AdminUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<AdminUser | null> {
    return this.prisma.adminUser.findUnique({ where: { email } });
  }

  findById(id: number): Promise<AdminUser | null> {
    return this.prisma.adminUser.findUnique({ where: { id } });
  }

  listAll(): Promise<AdminUser[]> {
    return this.prisma.adminUser.findMany({ orderBy: { id: 'asc' } });
  }

  /** 계정이 하나라도 있는가. 부팅 시 기본 계정 생성 여부를 정하는 데 쓴다. */
  count(): Promise<number> {
    return this.prisma.adminUser.count();
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
    return this.prisma.adminUser.count({ where: { role } });
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
    input: { email?: string; name?: string | null; role?: AdminRole },
  ): Promise<AdminUser> {
    return this.prisma.adminUser.update({ where: { id }, data: input });
  }

  /** 계정 삭제. 세션(admin_token_session)은 FK Cascade 로 함께 지워진다. */
  delete(id: number): Promise<void> {
    return this.prisma.adminUser.deleteMany({ where: { id } }).then(() => undefined);
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
