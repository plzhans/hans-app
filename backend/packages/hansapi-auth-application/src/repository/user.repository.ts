import { Injectable } from '@nestjs/common';
import {
  AuthProvider,
  PrismaService,
  User,
  UserStatus,
  UserTier,
} from '@hansapi/data';

/**
 * 회원 저장소. DB 접근·쿼리 조립만 담당한다(캐시·정책은 서비스가).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** 활성(ACTIVE) 회원만 이메일로 조회. 로그인·중복체크에 쓴다. */
  findActiveByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, status: UserStatus.ACTIVE },
    });
  }

  create(input: {
    email: string;
    emailVerified: boolean;
    password: string | null;
    name: string | null;
    joinType: AuthProvider;
  }): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  updatePassword(id: number, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { password: passwordHash },
    });
  }

  markEmailVerified(id: number): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { emailVerified: true },
    });
  }

  /** 등급 변경. 앱 생성 한도(APP_LIMIT_BY_TIER)를 정하는 값이라 운영자만 건드린다. */
  updateTier(id: number, tier: UserTier): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { tier } });
  }

  /** 탈퇴 처리: 상태를 WITHDRAWN 으로 바꾸고 탈퇴 시각을 남긴다(하드삭제는 배치가 수행). */
  markWithdrawn(id: number, withdrawnAt: Date): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.WITHDRAWN, withdrawnAt },
    });
  }
}
