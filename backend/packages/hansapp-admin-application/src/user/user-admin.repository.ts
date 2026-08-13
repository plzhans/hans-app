import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

/**
 * 관리자용 회원 수정 저장소.
 *
 * **조회는 UserReadRepository 가 한다.** 그쪽은 이름부터 읽기 전용이라, 쓰기를 섞어 두면
 * "회원 통로는 읽기 전용" 이라는 규칙이 다음 사람에게 안 보인다(세션 폐기도 같은 이유로
 * 따로 두었다).
 */
@Injectable()
export class UserAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 준 항목만 바꾼다. **없는 회원이면 0 을 돌려준다** — update 는 없을 때 던지는데,
   * 그 예외를 잡아 404 로 바꾸느니 건수를 보고 호출부가 정하는 편이 읽기 쉽다.
   */
  updateProfile(id: number, data: { name?: string | null }): Promise<number> {
    return this.prisma.user.updateMany({ where: { id }, data }).then((result) => result.count);
  }
}
