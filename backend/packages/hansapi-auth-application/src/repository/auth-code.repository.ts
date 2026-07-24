import { Injectable } from '@nestjs/common';
import { PrismaService, UserAuthCode } from '@hansapi/data';

/**
 * 소셜 콜백→프론트 릴레이 1회용 인가코드 저장소.
 */
@Injectable()
export class AuthCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    sid: string;
    userId: number;
    /** 발급 대상 클라이언트. null 이면 1st-party(hansapp-web). */
    clientId: string | null;
    secretHash: string;
    expiresAt: Date;
  }): Promise<UserAuthCode> {
    return this.prisma.userAuthCode.create({ data: input });
  }

  findById(sid: string): Promise<UserAuthCode | null> {
    return this.prisma.userAuthCode.findUnique({ where: { sid } });
  }

  /**
   * 코드를 소비한다(1회용). 아직 소비되지 않은 건만 consumedAt 을 찍고 그 결과를 반환한다.
   * 이미 소비됐으면 count=0 → 재사용 시도이므로 호출측이 거부한다.
   */
  consume(sid: string, at: Date): Promise<number> {
    return this.prisma.userAuthCode
      .updateMany({
        where: { sid, consumedAt: null },
        data: { consumedAt: at },
      })
      .then((r) => r.count);
  }
}
