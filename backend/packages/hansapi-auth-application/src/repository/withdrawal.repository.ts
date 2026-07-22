import { Injectable } from '@nestjs/common';
import { PrismaService, UserWithdrawal } from '@hansapi/data';

/**
 * 탈퇴 기록 저장소. 가입 중복 체크가 이 표도 조회한다.
 */
@Injectable()
export class WithdrawalRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    originalUserId: number;
    email: string;
    name: string | null;
    purgeAt: Date;
  }): Promise<UserWithdrawal> {
    return this.prisma.userWithdrawal.create({ data: input });
  }

  /**
   * 아직 정리(파기)되지 않은 탈퇴 기록 중 해당 이메일 건을 조회한다.
   * 재가입 차단 판정에 쓴다(purgeAt 이 지나지 않은 건 = 재가입 대기중).
   */
  findActiveByEmail(email: string, now: Date): Promise<UserWithdrawal | null> {
    return this.prisma.userWithdrawal.findFirst({
      where: { email, purgeAt: { gt: now } },
    });
  }

  /** purgeAt 이 지난 기록을 정리한다(배치). 반환값은 삭제 건수. */
  deletePurged(now: Date): Promise<number> {
    return this.prisma.userWithdrawal
      .deleteMany({ where: { purgeAt: { lte: now } } })
      .then((r) => r.count);
  }
}
