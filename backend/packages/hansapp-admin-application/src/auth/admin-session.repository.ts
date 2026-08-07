import { Injectable } from '@nestjs/common';
import { AdminTokenSession, PrismaService } from '@hansapp/data';

/**
 * 관리자 refresh 세션 저장소. 토큰 원문은 없고 secret 해시만 다룬다.
 *
 * 회원 쪽(UserTokenSession)과 달리 persistent 가 없다 — 관리자 쿠키는 항상 세션 쿠키다.
 */
@Injectable()
export class AdminSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    sessionId: string;
    adminId: number;
    secretHash: string;
    userAgent: string | null;
    ip: string | null;
    expiresAt: Date;
  }): Promise<AdminTokenSession> {
    return this.prisma.adminTokenSession.create({ data: input });
  }

  findById(sessionId: string): Promise<AdminTokenSession | null> {
    return this.prisma.adminTokenSession.findUnique({ where: { sessionId } });
  }

  /** rotate: 새 secret 해시 + 만료 연장(sliding). */
  rotate(
    sessionId: string,
    secretHash: string,
    expiresAt: Date,
  ): Promise<AdminTokenSession> {
    return this.prisma.adminTokenSession.update({
      where: { sessionId },
      data: { secretHash, expiresAt },
    });
  }

  delete(sessionId: string): Promise<void> {
    return this.prisma.adminTokenSession
      .deleteMany({ where: { sessionId } })
      .then(() => undefined);
  }

  /**
   * 이 관리자의 세션 하나를 지운다. **adminId 를 조건에 함께 넣는다** —
   * 세션 식별자만으로 지우면 남의 세션 id 를 넣어 끊을 수 있다.
   */
  deleteOwned(adminId: number, sessionId: string): Promise<number> {
    return this.prisma.adminTokenSession
      .deleteMany({ where: { sessionId, adminId } })
      .then((r) => r.count);
  }

  deleteAllByAdmin(adminId: number): Promise<number> {
    return this.prisma.adminTokenSession
      .deleteMany({ where: { adminId } })
      .then((r) => r.count);
  }

  /**
   * 이 관리자의 세션을 최근 `keep` 개만 남기고 지운다.
   *
   * 목록을 앱으로 가져오지 않는다 — 남길 경계(keep 번째로 최근인 세션의 시각)만 찾고
   * 그보다 오래된 것을 지운다. 기준이 updatedAt 인 이유는 rotate 마다 갱신되기 때문이다:
   * 계속 쓰는 기기는 남고, 만든 뒤 방치된 세션이 먼저 밀린다.
   */
  async trimToLimit(adminId: number, keep: number): Promise<number> {
    const boundary = await this.prisma.adminTokenSession.findMany({
      where: { adminId },
      orderBy: { updatedAt: 'desc' },
      skip: keep - 1,
      take: 1,
      select: { updatedAt: true },
    });
    // 아직 상한을 넘지 않았다. 지울 것이 없다.
    if (boundary.length === 0) return 0;

    const { count } = await this.prisma.adminTokenSession.deleteMany({
      where: { adminId, updatedAt: { lt: boundary[0].updatedAt } },
    });
    return count;
  }
}
