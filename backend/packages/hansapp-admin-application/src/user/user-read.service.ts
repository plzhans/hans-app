import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { AuthProvider, ConsentType, OAuthProvider, UserStatus, UserTier } from '@hansapp/data';

import { UserReadRepository } from './user-read.repository';
import type { UserListFilter, UserSessionRow } from './user-read.repository';

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

/**
 * 동의 기록 한 줄.
 *
 * **IP·기기까지 담는다.** 동의 기록이 존재하는 이유가 "동의를 받았음" 의 입증이라, 그 자리를
 * 특정하는 접속 정보가 빠지면 관리자가 볼 수 있는 것이 본인 화면과 같아진다(그쪽은 종류·판·
 * 시각만 본다). 인증 기록 탭도 같은 수준으로 IP·기기를 보여 주고 있다.
 */
export interface UserConsentSummary {
  readonly type: ConsentType;
  /** 동의한 문서의 판(시행일). 문서가 없는 항목은 '-'. */
  readonly version: string;
  readonly agreedAt: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface UserDetail extends UserSummary {
  readonly updatedAt: Date;
  readonly withdrawnAt: Date | null;
  /** 표시·메일 언어(ko/en/ja/zh). 비어 있으면 요청의 Accept-Language 를 따른다. */
  readonly language: string | null;
  /** IANA 타임존 ID(예: Asia/Seoul). 비어 있으면 화면 기본값을 따른다. */
  readonly timeZone: string | null;
  /** 이메일 로그인이 가능한 계정인가. **해시는 내보내지 않고 이 불리언만 준다.** */
  readonly hasPassword: boolean;
  readonly oauths: UserOAuthSummary[];
  readonly activeSessionCount: number;
  readonly appCount: number;
  /** 받아 둔 동의. 가입 때 받은 것과 앱을 등록할 때 받은 것이 함께 온다. */
  readonly consents: UserConsentSummary[];
}

/** 로그인해 둔 기기 한 줄. */
export type UserSession = UserSessionRow;

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
      language: row.user.language,
      timeZone: row.user.timeZone,
      hasPassword: row.user.password !== null,
      oauths: row.oauths.map((o) => ({
        provider: o.provider,
        email: o.email,
        connectedAt: o.createdAt,
      })),
      activeSessionCount: row.activeSessionCount,
      appCount: row.appCount,
      consents: row.consents.map((c) => ({
        type: c.type,
        version: c.version,
        agreedAt: c.agreedAt,
        ip: c.ip,
        userAgent: c.userAgent,
      })),
    };
  }

  /** 이 회원이 로그인해 둔 기기들. 살아 있는 것만, 최근 활동 순. */
  listSessions(userId: number): Promise<UserSession[]> {
    return this.repo.listSessions(userId, new Date());
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
