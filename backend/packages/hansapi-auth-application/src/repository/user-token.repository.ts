import { Injectable } from '@nestjs/common';
import { PrismaService, TokenPurpose, UserToken } from '@hansapi/data';

/**
 * 이메일 인증 / 비밀번호 재설정 일회성 토큰 저장소. 원문 대신 해시만 다룬다.
 */
@Injectable()
export class UserTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    userId: number;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<UserToken> {
    return this.prisma.userToken.create({ data: input });
  }

  findByHash(
    purpose: TokenPurpose,
    tokenHash: string,
  ): Promise<UserToken | null> {
    return this.prisma.userToken.findFirst({
      where: { purpose, tokenHash },
    });
  }

  /** 1회용 소비. 아직 소비되지 않은 건만 처리하고 count 반환. */
  consume(id: number, at: Date): Promise<number> {
    return this.prisma.userToken
      .updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: at },
      })
      .then((r) => r.count);
  }

  /** 같은 용도의 기존(미소비) 토큰을 정리한다(재발급 시 이전 토큰 무효화). */
  deleteByUserAndPurpose(
    userId: number,
    purpose: TokenPurpose,
  ): Promise<number> {
    return this.prisma.userToken
      .deleteMany({ where: { userId, purpose } })
      .then((r) => r.count);
  }
}
