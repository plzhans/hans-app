import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

/**
 * 관리자용 회원 세션 폐기 저장소.
 *
 * **조회는 UserReadRepository 가 하고 여기는 지우기만 한다.** 회원 통로 전체가 읽기 전용인데
 * 세션 폐기 하나가 예외라, 그 예외를 파일 하나로 몰아 둔다 — 읽기 저장소에 섞어 두면
 * "여기는 읽기 전용" 이라는 규칙이 다음 사람에게 안 보인다.
 *
 * **지운 세션 식별자를 돌려준다.** 세션 캐시는 sid 로 키를 잡으므로 무엇을 지웠는지
 * 알려 줘야 폐기 이벤트를 만들 수 있다. 지운 뒤에는 행이 없어 되물을 수도 없다.
 */
@Injectable()
export class UserSessionAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 세션 하나를 지운다. **userId 를 조건에 함께 넣는다** — 식별자만으로 지우면 남의
   * 세션 id 를 넣어 끊을 수 있다. 없으면 빈 배열이다(호출부가 404 로 가른다).
   */
  async deleteOne(userId: number, sessionId: number): Promise<number[]> {
    const { count } = await this.prisma.userTokenSession.deleteMany({
      where: { sessionId, userId },
    });
    return count ? [sessionId] : [];
  }

  /**
   * 이 회원의 세션을 전부 지운다.
   *
   * **만료된 것까지 지운다.** 목록에는 살아 있는 것만 보이지만, 여기서 남겨 둘 이유가 없다 —
   * 어차피 정리 배치가 치울 행이고, 조건을 하나 더 두면 "전부" 가 전부가 아니게 된다.
   */
  async deleteAll(userId: number): Promise<number[]> {
    const rows = await this.prisma.userTokenSession.findMany({
      where: { userId },
      select: { sessionId: true },
    });
    if (rows.length === 0) return [];

    await this.prisma.userTokenSession.deleteMany({ where: { userId } });
    return rows.map((row) => row.sessionId);
  }
}
