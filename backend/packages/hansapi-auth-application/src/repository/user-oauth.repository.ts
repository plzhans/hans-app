import { Injectable } from '@nestjs/common';
import { OAuthProvider, PrismaService, UserOAuth } from '@hansapi/data';

/**
 * 계정↔소셜 연동 저장소.
 */
@Injectable()
export class UserOAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** (provider, providerId) 로 연동을 조회한다(소셜 로그인 진입점). */
  findByProvider(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<UserOAuth | null> {
    return this.prisma.userOAuth.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
  }

  listByUser(userId: number): Promise<UserOAuth[]> {
    return this.prisma.userOAuth.findMany({ where: { userId } });
  }

  create(input: {
    userId: number;
    provider: OAuthProvider;
    providerId: string;
    email: string | null;
  }): Promise<UserOAuth> {
    return this.prisma.userOAuth.create({ data: input });
  }

  delete(userId: number, provider: OAuthProvider): Promise<number> {
    return this.prisma.userOAuth
      .deleteMany({ where: { userId, provider } })
      .then((r) => r.count);
  }
}
