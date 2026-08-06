import { Injectable } from '@nestjs/common';
import { ConsentType, PrismaService, UserConsent } from '@hansapp/data';

/** 가입 동의 기록 저장소. */
@Injectable()
export class UserConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 동의 기록을 한 번에 남긴다.
   *
   * **createMany 다.** 항목이 셋(약관·개인정보·연령)인데 하나씩 넣으면 중간에 실패했을 때
   * "약관만 동의한 회원" 같은 반쪽 기록이 남는다. 입증하려고 남기는 기록이 반쪽이면 안 남긴
   * 것만 못하다.
   */
  createMany(
    rows: {
      userId: number;
      type: ConsentType;
      version: string;
      ip: string | null;
      userAgent: string | null;
    }[],
  ): Promise<{ count: number }> {
    return this.prisma.userConsent.createMany({ data: rows });
  }

  /** 이 회원이 남긴 동의 기록. 최신순. 재동의가 필요한지 판단하거나 열람 요구에 답할 때 쓴다. */
  listByUser(userId: number): Promise<UserConsent[]> {
    return this.prisma.userConsent.findMany({
      where: { userId },
      orderBy: { agreedAt: 'desc' },
    });
  }
}
