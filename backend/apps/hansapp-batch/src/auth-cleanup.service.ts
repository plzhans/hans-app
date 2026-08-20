import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

/**
 * 인증 흐름이 남긴 **만료된 부산물**을 지운다.
 *
 * 세 테이블이 같은 수명 규칙을 가진다 — 만료되면 되살릴 수단이 없고, 그때부터는 아무도
 * 쓸 수 없는 줄이 된다. 그런데도 지우는 사람이 없어 계속 쌓였다.
 *
 *   · `user_token_session`   로그인 세션. 로그인마다 한 줄이 생기고, 로그아웃하지 않고
 *                            브라우저만 닫으면 만료될 때까지 남는다
 *   · `user_auth_code`       소셜 콜백 릴레이용 1회용 인가코드(수명 30초 안팎)
 *   · `email_verification`   가입·비밀번호 재설정 인증 코드
 *
 * **조회에서 거르는 것과 지우는 것은 다르다.** 마이페이지의 기기 목록은 만료 행을 빼고
 * 보여주지만 DB 에는 그대로 있다.
 *
 * **되돌릴 수 없는 삭제라 조건을 좁게 잡는다** — 만료 시각이 지난 것만이다. 살아 있는 줄은
 * 건드리지 않으므로, 잘못 돌려도 로그인이 끊기거나 진행 중인 인증이 깨지지 않는다.
 * 소비된(consumed) 줄도 만료 전이면 남겨 둔다 — 재사용 시도를 가려내는 근거가 되고,
 * 어차피 곧 만료된다.
 *
 * **탈퇴 정리(`user_withdrawal` → User 하드삭제)는 여기 없다.** 그쪽은 회원 자체를 지우고
 * 연쇄 삭제가 따라붙어서 성격이 다르다 — 별도 잡으로 다룬다.
 *
 * [왜 auth-application 이 아니라 여기인가]
 * 인증 계층의 데이터지만, 그 패키지를 배치가 통째로 가져오면 소셜 로그인 전략(passport)까지
 * 딸려 온다 — 만료 행을 지우는 잡이 인증 스택 전체를 컴파일·주입하게 된다.
 * 여기서 필요한 것은 Prisma 하나뿐이고, 배치는 이미 그것을 갖고 있다.
 */
/**
 * 한 회차의 결과.
 *
 * **삼킨 실패를 실어 올린다.** 테이블별 실패는 이 서비스가 삼키므로, 돌려주지 않으면
 * 셋 다 실패해도 회차가 성공으로 기록된다.
 */
export interface AuthCleanupResult {
  /** 테이블별 삭제 건수. 실패한 테이블은 빠진다. */
  readonly removed: Record<string, number>;

  /** 전체 삭제 건수 */
  readonly total: number;

  /** 실패한 테이블. 비어 있으면 다 지웠다. */
  readonly failed: string[];
}

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<AuthCleanupResult> {
    const expired = { lt: now };

    /*
      **한 테이블이 실패해도 나머지는 지운다.** 셋은 서로 의존이 없다 — 하나가 잠금에 걸렸다고
      나머지를 하루 더 쌓아 둘 이유가 없다. 실패는 각각 로그로 남고, 다음 회차에 다시 시도된다.
    */
    const swept = await Promise.all([
      this.sweep('user_token_session', () =>
        this.prisma.userTokenSession.deleteMany({
          where: { expiresAt: expired },
        }),
      ),
      this.sweep('user_auth_code', () =>
        this.prisma.userAuthCode.deleteMany({ where: { expiresAt: expired } }),
      ),
      this.sweep('email_verification', () =>
        this.prisma.emailVerification.deleteMany({
          where: { expiresAt: expired },
        }),
      ),
    ]);

    const removed: Record<string, number> = {};
    const failed: string[] = [];
    for (const result of swept) {
      if (result.count === undefined) {
        failed.push(result.table);
      } else {
        removed[result.table] = result.count;
      }
    }

    return {
      removed,
      total: Object.values(removed).reduce((sum, count) => sum + count, 0),
      failed,
    };
  }

  /** 한 테이블을 쓸고 결과를 남긴다. 0 건이어도 남긴다 — 잡이 돌긴 했는지 보여야 한다. */
  private async sweep(
    table: string,
    remove: () => Promise<{ count: number }>,
  ): Promise<SweepResult> {
    try {
      const { count } = await remove();
      this.logger.log(`${table} cleanup: ${count} rows`);
      return { table, count };
    } catch (error) {
      // 던지지 않는다. 나머지 테이블은 계속 지우고, 실패는 결과에 실어 올린다.
      this.logger.error(`${table} cleanup failed`, error);
      return { table };
    }
  }
}

/** 한 테이블의 결과. count 가 없으면 실패한 것이다. */
interface SweepResult {
  readonly table: string;
  readonly count?: number;
}
