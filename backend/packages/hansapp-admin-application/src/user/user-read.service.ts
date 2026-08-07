import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type {
  AuthProvider,
  OAuthProvider,
  UserStatus,
  UserTier,
} from '@hansapp/data';

import { UserReadRepository } from './user-read.repository';
import type { UserListFilter } from './user-read.repository';

/** 목록 한 줄. **비밀번호 해시는 물론 존재 여부도 여기 담지 않는다.** */
export interface UserSummary {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
  readonly status: UserStatus;
  readonly role: string;
  readonly tier: UserTier;
  readonly joinType: AuthProvider;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
}

export interface UserOAuthSummary {
  readonly provider: OAuthProvider;
  readonly email: string | null;
  readonly connectedAt: Date;
}

export interface UserDetail extends UserSummary {
  readonly updatedAt: Date;
  readonly withdrawnAt: Date | null;
  /** 이메일 로그인이 가능한 계정인가. **해시는 내보내지 않고 이 불리언만 준다.** */
  readonly hasPassword: boolean;
  readonly oauths: UserOAuthSummary[];
  readonly activeSessionCount: number;
  readonly appCount: number;
}

export interface UserListQuery extends UserListFilter {
  readonly page: number;
  readonly size: number;
}

/**
 * 관리자용 회원 조회.
 *
 * **저장소가 주는 Prisma 엔티티를 그대로 흘려보내지 않는다.** User 에는 bcrypt 해시가 들어 있어,
 * 엔티티를 그대로 반환하면 컨트롤러가 DTO 로 고르는 것을 한 번만 빠뜨려도 해시가 응답에 실린다.
 * 이 계층에서 필드를 골라 내보내면 그 사고가 구조적으로 불가능해진다.
 */
@Injectable()
export class UserReadService {
  constructor(private readonly repo: UserReadRepository) {}

  async list(query: UserListQuery): Promise<Page<UserSummary>> {
    const [rows, total] = await this.repo.listPage(
      { keyword: query.keyword, status: query.status },
      (query.page - 1) * query.size,
      query.size,
    );

    return new Page(rows.map(toSummary), query.page, query.size, total);
  }

  async findById(id: number): Promise<UserDetail | null> {
    const row = await this.repo.findDetail(id, new Date());
    if (!row) return null;

    return {
      ...toSummary(row.user),
      updatedAt: row.user.updatedAt,
      withdrawnAt: row.user.withdrawnAt,
      hasPassword: row.user.password !== null,
      oauths: row.oauths.map((o) => ({
        provider: o.provider,
        email: o.email,
        connectedAt: o.createdAt,
      })),
      activeSessionCount: row.activeSessionCount,
      appCount: row.appCount,
    };
  }
}

function toSummary(user: {
  id: number;
  email: string;
  name: string | null;
  status: UserStatus;
  role: string;
  tier: UserTier;
  joinType: AuthProvider;
  emailVerified: boolean;
  createdAt: Date;
}): UserSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    role: user.role,
    tier: user.tier,
    joinType: user.joinType,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}
