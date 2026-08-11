import { Injectable } from '@nestjs/common';
import { AdminPasswordReset, PrismaService } from '@hansapp/data';

/**
 * 비밀번호 재설정 티켓 저장소. **토큰 원문은 다루지 않는다** — 해시만 오간다.
 */
@Injectable()
export class AdminPasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    adminId: number;
    tokenHash: string;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  }): Promise<AdminPasswordReset> {
    return this.prisma.adminPasswordReset.create({ data: input });
  }

  findByTokenHash(tokenHash: string): Promise<AdminPasswordReset | null> {
    return this.prisma.adminPasswordReset.findUnique({ where: { tokenHash } });
  }

  /**
   * 티켓을 쓴 것으로 찍는다. **아직 안 쓴 것만 찍힌다.**
   *
   * `updateMany` + `usedAt: null` 조건이라 같은 링크로 동시에 두 번 들어와도 한쪽만
   * 1을 받는다 — 그 한 번만 비밀번호를 바꾼다(단순 update 면 둘 다 통과한다).
   */
  markUsed(id: number, at: Date): Promise<number> {
    return this.prisma.adminPasswordReset
      .updateMany({ where: { id, usedAt: null }, data: { usedAt: at } })
      .then((r) => r.count);
  }

  /**
   * 이 계정의 **아직 안 쓴** 티켓을 모두 지운다.
   *
   * 새로 요청할 때마다 부른다 — 메일함에 남은 옛 링크가 계속 살아 있으면, 한 번 새어 나간
   * 메일이 언제까지나 열쇠가 된다.
   */
  deleteUnusedByAdmin(adminId: number): Promise<number> {
    return this.prisma.adminPasswordReset
      .deleteMany({ where: { adminId, usedAt: null } })
      .then((r) => r.count);
  }

  /** 이 계정이 최근 `since` 이후 요청한 횟수. 발송 횟수를 묶는 데 쓴다. */
  countRecentByAdmin(adminId: number, since: Date): Promise<number> {
    return this.prisma.adminPasswordReset.count({
      where: { adminId, createdAt: { gte: since } },
    });
  }
}
