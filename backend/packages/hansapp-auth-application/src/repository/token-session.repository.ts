import { Injectable } from '@nestjs/common';
import { PrismaService, UserTokenSession } from '@hansapp/data';

/**
 * refresh 세션 저장소. 토큰 원문은 없고 secret 해시만 다룬다.
 */
@Injectable()
export class TokenSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    sessionId: string;
    userId: number;
    secretHash: string;
    userAgent: string | null;
    ip: string | null;
    expiresAt: Date;
  }): Promise<UserTokenSession> {
    return this.prisma.userTokenSession.create({ data: input });
  }

  findById(sessionId: string): Promise<UserTokenSession | null> {
    return this.prisma.userTokenSession.findUnique({ where: { sessionId } });
  }

  /** rotate: 새 secret 해시 + 만료 연장(sliding). */
  rotate(
    sessionId: string,
    secretHash: string,
    expiresAt: Date,
  ): Promise<UserTokenSession> {
    return this.prisma.userTokenSession.update({
      where: { sessionId },
      data: { secretHash, expiresAt },
    });
  }

  delete(sessionId: string): Promise<void> {
    return this.prisma.userTokenSession
      .deleteMany({ where: { sessionId } })
      .then(() => undefined);
  }

  /** 회원의 모든 세션 삭제(탈퇴·전체 로그아웃). */
  deleteAllByUser(userId: number): Promise<number> {
    return this.prisma.userTokenSession
      .deleteMany({ where: { userId } })
      .then((r) => r.count);
  }
}
