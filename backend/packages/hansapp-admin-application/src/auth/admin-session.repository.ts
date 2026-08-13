import { Injectable } from '@nestjs/common';
import { AdminTokenSession, PrismaService } from '@hansapp/data';

/**
 * 관리자 refresh 세션 저장소. 토큰 원문은 없고 secret 해시만 다룬다.
 *
 * **키가 (관리자, 세션) 복합키다.** 세션 식별자는 계정 안에서만 유일해서, 어느 조회든
 * 관리자번호를 함께 준다 — 식별자 하나로 열리는 통로가 없으면 확인을 잊은 코드가 곧바로
 * 남의 세션을 건드리는 일이 생기지 않는다(회원 세션과 같은 규칙).
 *
 * 회원 쪽(UserTokenSession)과 달리 persistent 가 없다 — 관리자 쿠키는 항상 세션 쿠키다.
 */
@Injectable()
export class AdminSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    sessionId: number;
    adminId: number;
    secretHash: string;
    userAgent: string | null;
    ip: string | null;
    expiresAt: Date;
  }): Promise<AdminTokenSession> {
    return this.prisma.adminTokenSession.create({ data: input });
  }

  /** 이 관리자의 세션 하나. 복합키라 (관리자, 세션) 짝이 맞는 행만 나온다. */
  findOwned(adminId: number, sessionId: number): Promise<AdminTokenSession | null> {
    return this.prisma.adminTokenSession.findUnique({
      where: { adminId_sessionId: { adminId, sessionId } },
    });
  }

  /** rotate: 새 secret 해시 + 만료 연장(sliding). */
  rotate(
    adminId: number,
    sessionId: number,
    secretHash: string,
    expiresAt: Date,
  ): Promise<AdminTokenSession> {
    return this.prisma.adminTokenSession.update({
      where: { adminId_sessionId: { adminId, sessionId } },
      data: { secretHash, expiresAt },
    });
  }

  /**
   * 세션 하나를 지운다. **adminId 를 조건에 함께 넣는다** — 세션 식별자만으로 지우면
   * 남의 세션 번호를 넣어 끊을 수 있다.
   */
  deleteOwned(adminId: number, sessionId: number): Promise<number> {
    return this.prisma.adminTokenSession
      .deleteMany({ where: { sessionId, adminId } })
      .then((r) => r.count);
  }

  /**
   * 이 관리자의 살아 있는 세션 수. **만료된 것은 뺀다.**
   *
   * 만료 행은 rotate 나 로그인 때 정리되지 않고 그대로 남아 있어, 세지 않고 다 세면
   * 몇 달째 안 쓰는 계정이 "지금 로그인 중" 으로 보인다.
   */
  countActiveByAdmin(adminId: number, now: Date): Promise<number> {
    return this.prisma.adminTokenSession.count({
      where: { adminId, expiresAt: { gt: now } },
    });
  }

  /**
   * 이 관리자의 살아 있는 세션. **최근 활동 순.**
   *
   * 만료된 것은 뺀다 — 정리 배치가 치울 때까지 남아 있을 뿐이라, 같이 내보내면 몇 달째
   * 안 쓰는 기기가 "지금 로그인 중" 으로 보인다(countActiveByAdmin 과 같은 규칙).
   */
  listActiveByAdmin(adminId: number, now: Date): Promise<AdminTokenSession[]> {
    return this.prisma.adminTokenSession.findMany({
      where: { adminId, expiresAt: { gt: now } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * 이 관리자의 세션을 전부 지운다.
   *
   * **개수가 아니라 지운 식별자를 돌려준다.** 캐시는 세션 하나가 키 하나라, 몇 개를
   * 지웠는지만 알면 그 키들을 비울 수 없다 — 지우기 전에 목록을 먼저 읽는 이유가 그것이다.
   */
  async deleteAllByAdmin(adminId: number): Promise<number[]> {
    const rows = await this.prisma.adminTokenSession.findMany({
      where: { adminId },
      select: { sessionId: true },
    });
    if (rows.length === 0) return [];

    await this.prisma.adminTokenSession.deleteMany({ where: { adminId } });
    return rows.map((row) => row.sessionId);
  }

  /**
   * 이 관리자의 세션을 최근 `keep` 개만 남기고 지운다.
   *
   * 남길 경계(keep 번째로 최근인 세션의 시각)를 찾고 그보다 오래된 것을 지운다. 기준이
   * updatedAt 인 이유는 rotate 마다 갱신되기 때문이다: 계속 쓰는 기기는 남고, 만든 뒤
   * 방치된 세션이 먼저 밀린다.
   *
   * **지운 식별자를 돌려준다** — 캐시를 비우는 쪽이 그 값을 필요로 한다(deleteAllByAdmin 과 같다).
   */
  async trimToLimit(adminId: number, keep: number): Promise<number[]> {
    const boundary = await this.prisma.adminTokenSession.findMany({
      where: { adminId },
      orderBy: { updatedAt: 'desc' },
      skip: keep - 1,
      take: 1,
      select: { updatedAt: true },
    });
    // 아직 상한을 넘지 않았다. 지울 것이 없다.
    if (boundary.length === 0) return [];

    const where = { adminId, updatedAt: { lt: boundary[0].updatedAt } };
    const rows = await this.prisma.adminTokenSession.findMany({
      where,
      select: { sessionId: true },
    });
    if (rows.length === 0) return [];

    await this.prisma.adminTokenSession.deleteMany({ where });
    return rows.map((row) => row.sessionId);
  }
}
