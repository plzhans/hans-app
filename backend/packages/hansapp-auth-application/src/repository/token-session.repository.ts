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
    /** "로그인 상태 유지" 선택. 쿠키를 영속으로 심을지 정한다. */
    persistent: boolean;
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

  /**
   * 이 회원의 살아 있는 세션 목록. 최근 활동 순.
   *
   * **만료된 것은 뺀다.** 로그아웃 대상이 못 되는 줄을 목록에 두면 눌러도 아무 일이
   * 안 일어난다. 만료 행은 정리 배치가 치울 때까지 DB 에 남아 있을 뿐이다.
   */
  listActiveByUser(userId: number, now: Date): Promise<UserTokenSession[]> {
    return this.prisma.userTokenSession.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * 이 회원의 세션 하나를 지운다. **userId 를 조건에 함께 넣는다** —
   * 세션 식별자만으로 지우면 남의 세션 id 를 넣어 끊을 수 있다.
   * 지운 건수를 돌려주므로 호출부가 "내 것이 아니었다" 를 구분할 수 있다.
   */
  deleteOwned(userId: number, sessionId: string): Promise<number> {
    return this.prisma.userTokenSession
      .deleteMany({ where: { sessionId, userId } })
      .then((r) => r.count);
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
