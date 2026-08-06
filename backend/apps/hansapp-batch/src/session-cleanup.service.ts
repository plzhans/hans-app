import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

/**
 * 만료된 로그인 세션을 지운다.
 *
 * **조회에서 거르는 것과 지우는 것은 다르다.** 마이페이지의 기기 목록은 만료 행을 빼고
 * 보여주지만 `user_token_session` 에는 계속 쌓인다 — 로그인할 때마다 한 줄이 생기고,
 * 로그아웃하지 않고 브라우저만 닫으면 만료될 때까지 남기 때문이다. 만료된 세션은 되살릴
 * 수단이 없으므로 남겨 둘 이유가 없다.
 *
 * **되돌릴 수 없는 삭제라 조건을 좁게 잡는다** — 만료 시각이 지난 것만이다. 살아 있는
 * 세션은 건드리지 않으므로, 잘못 돌려도 로그인이 끊기지 않는다.
 *
 * [왜 auth-application 이 아니라 여기인가]
 * 세션은 인증 계층의 것이지만, 그 패키지를 배치가 통째로 가져오면 소셜 로그인 전략(passport)
 * 까지 딸려 온다 — 한 테이블을 지우는 잡이 인증 스택 전체를 컴파일·주입하게 된다.
 * 여기서 필요한 것은 Prisma 하나뿐이고, 배치는 이미 그것을 갖고 있다.
 */
@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** @returns 지운 세션 수. */
  async run(now = new Date()): Promise<number> {
    const { count } = await this.prisma.userTokenSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    // 0 건이어도 남긴다 — 잡이 돌기는 했는지를 로그로 확인할 수 있어야 한다.
    this.logger.log(`만료 세션 정리 — ${count}건`);
    return count;
  }
}
