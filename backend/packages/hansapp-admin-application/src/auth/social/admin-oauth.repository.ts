import { Injectable } from '@nestjs/common';
import { AdminOAuth, OAuthProvider, PrismaService } from '@hansapp/data';

/** 관리자 소셜 연동(admin_oauth) 저장소. */
@Injectable()
export class AdminOAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * provider 가 준 식별자로 찾는다. **로그인의 첫 조회다** — 이메일이 아니라 이 값이 신원이라
   * 구글 쪽에서 이메일을 바꿔도 같은 관리자를 가리킨다.
   */
  findByProviderId(provider: OAuthProvider, providerId: string): Promise<AdminOAuth | null> {
    return this.prisma.adminOAuth.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
  }

  findByAdmin(adminId: number, provider: OAuthProvider): Promise<AdminOAuth | null> {
    return this.prisma.adminOAuth.findUnique({
      where: { adminId_provider: { adminId, provider } },
    });
  }

  listByAdmin(adminId: number): Promise<AdminOAuth[]> {
    return this.prisma.adminOAuth.findMany({ where: { adminId }, orderBy: { id: 'asc' } });
  }

  create(input: {
    adminId: number;
    provider: OAuthProvider;
    providerId: string;
    email: string | null;
  }): Promise<AdminOAuth> {
    return this.prisma.adminOAuth.create({ data: input });
  }

  /** 연동을 뗀다. 지운 건수를 돌려준다 — 없는 것을 뗀 요청과 실제로 뗀 요청을 가른다. */
  delete(adminId: number, provider: OAuthProvider): Promise<number> {
    return this.prisma.adminOAuth.deleteMany({ where: { adminId, provider } }).then((r) => r.count);
  }
}
