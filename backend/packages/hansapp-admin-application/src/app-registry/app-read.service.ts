import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { AppClientType, AppStatus } from '@hansapp/data';

import { AppReadRepository } from './app-read.repository';
import type { AppListFilter } from './app-read.repository';

/** 앱을 소유·참여하는 회원. 회원 상세로 넘어갈 수 있게 id 를 같이 준다. */
export interface AppMemberSummary {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
}

export interface AppSummary {
  readonly id: number;
  readonly name: string;
  readonly status: AppStatus;
  /** 심사 요청 시각. status=PENDING 일 때만 의미가 있다(null 이면 아직 요청 전). */
  readonly reviewRequestedAt: Date | null;
  /** 거절 사유. PENDING + 이 값이 있으면 '거절됨'. */
  readonly rejectionReason: string | null;
  /** 소프트 삭제 시각. null 이 아니면 지워진 앱이다. */
  readonly deletedAt: Date | null;
  readonly owner: AppMemberSummary | null;
  readonly apiKeyCount: number;
  readonly clientCount: number;
  readonly memberCount: number;
  readonly createdAt: Date;
}

/** 서비스 키. **해시도 접두사 외의 원문 조각도 내보내지 않는다.** */
export interface AppApiKeySummary {
  readonly id: number;
  readonly name: string;
  /** 표시용 접두사. 어떤 키인지 알아보는 용도이지 인증에 쓸 수 있는 값이 아니다. */
  readonly keyPrefix: string;
  readonly status: AppStatus;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
}

/** OAuth 클라이언트. client secret 은 해시를 내보내지 않고 뒤 4자만 준다. */
export interface AppClientSummary {
  readonly id: number;
  readonly clientId: string;
  readonly name: string;
  readonly type: AppClientType;
  readonly origins: string[];
  readonly redirectUris: string[];
  /** client secret 뒤 4자(마스킹 표기용). 네이티브 클라이언트는 null. */
  readonly secretSuffix: string | null;
  /** client secret 발급·재발급 시각. 마지막으로 언제 돌렸는지 보는 값이다. */
  readonly secretCreatedAt: Date | null;
  /**
   * 네이티브 플랫폼 식별자. iOS={ bundleId }, Android={ packageName, fingerprints[] }.
   * 웹은 null. **비밀값이 아니다** — 앱스토어에 공개되는 식별자다.
   */
  readonly config: Record<string, unknown> | null;
  readonly status: AppStatus;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
}

export interface AppDetail extends AppSummary {
  readonly apiKeyLimit: number;
  readonly updatedAt: Date;
  readonly members: {
    readonly role: string;
    readonly joinedAt: Date;
    readonly user: AppMemberSummary | null;
  }[];
  readonly apiKeys: AppApiKeySummary[];
  readonly clients: AppClientSummary[];
}

/**
 * 회원 한 명이 소유·참여하는 앱 한 줄.
 *
 * **목록 한 줄(AppSummary)과 다르다.** 소유자는 이미 아는 사람(그 회원)이라 빼고, 대신
 * 그 회원이 이 앱에서 무엇인지(역할)와 언제 합류했는지를 싣는다. 키·클라이언트 수는
 * 앱 상세로 넘어가서 볼 값이라 여기서 세지 않는다.
 */
export interface UserAppSummary {
  readonly id: number;
  readonly name: string;
  readonly status: AppStatus;
  readonly reviewRequestedAt: Date | null;
  readonly rejectionReason: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  /** 이 회원의 역할. OWNER(소유) / ADMIN(관리) / MEMBER(읽기). */
  readonly role: string;
  readonly joinedAt: Date;
}

export interface AppListQuery extends AppListFilter {
  readonly page: number;
  readonly size: number;
}

/**
 * 관리자용 앱 조회.
 *
 * **저장소가 주는 Prisma 엔티티를 그대로 흘려보내지 않는다.** AppApiKey 에는 키 해시가,
 * AppClient 에는 client secret 해시가 들어 있다. 이 계층에서 필드를 골라 내보내면 컨트롤러가
 * DTO 로 고르는 것을 한 번 빠뜨려도 해시가 응답에 실리지 않는다(회원 쪽과 같은 규칙).
 */
@Injectable()
export class AppReadService {
  constructor(private readonly repo: AppReadRepository) {}

  async list(query: AppListQuery): Promise<Page<AppSummary>> {
    const [rows, total] = await this.repo.listPage(
      {
        keyword: query.keyword,
        status: query.status,
        includeDeleted: query.includeDeleted,
      },
      (query.page - 1) * query.size,
      query.size,
    );

    return new Page(
      rows.map((row) => ({
        id: row.app.id,
        name: row.app.name,
        status: row.app.status,
        reviewRequestedAt: row.app.reviewRequestedAt,
        rejectionReason: row.app.rejectionReason,
        deletedAt: row.app.deletedAt,
        owner: row.owner,
        apiKeyCount: row.apiKeyCount,
        clientCount: row.clientCount,
        memberCount: row.memberCount,
        createdAt: row.app.createdAt,
      })),
      query.page,
      query.size,
      total,
    );
  }

  /** 회원 한 명이 소유·참여하는 앱. 최근 등록 순, 삭제된 앱도 포함한다. */
  async listByUser(userId: number): Promise<UserAppSummary[]> {
    const rows = await this.repo.listByMember(userId);

    return rows.map((row) => ({
      id: row.app.id,
      name: row.app.name,
      status: row.app.status,
      reviewRequestedAt: row.app.reviewRequestedAt,
      rejectionReason: row.app.rejectionReason,
      deletedAt: row.app.deletedAt,
      createdAt: row.app.createdAt,
      role: row.role,
      joinedAt: row.joinedAt,
    }));
  }

  async findById(id: number): Promise<AppDetail | null> {
    const row = await this.repo.findDetail(id);
    if (!row) return null;

    return {
      id: row.app.id,
      name: row.app.name,
      status: row.app.status,
      reviewRequestedAt: row.app.reviewRequestedAt,
      rejectionReason: row.app.rejectionReason,
      deletedAt: row.app.deletedAt,
      owner: row.owner,
      apiKeyCount: row.apiKeyCount,
      clientCount: row.clientCount,
      memberCount: row.memberCount,
      createdAt: row.app.createdAt,
      apiKeyLimit: row.app.apiKeyLimit,
      updatedAt: row.app.updatedAt,
      members: row.members,
      apiKeys: row.apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        status: k.status,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      })),
      clients: row.clients.map((c) => ({
        id: c.id,
        clientId: c.clientId,
        name: c.name,
        type: c.type,
        origins: toStringArray(c.origins),
        redirectUris: toStringArray(c.redirectUris),
        secretSuffix: c.secretSuffix,
        secretCreatedAt: c.secretCreatedAt,
        config: toPlainObject(c.config),
        status: c.status,
        lastUsedAt: c.lastUsedAt,
        createdAt: c.createdAt,
      })),
    };
  }
}

/**
 * Json 컬럼을 문자열 배열로 좁힌다.
 *
 * 스키마가 `Json?` 이라 타입만으로는 무엇이든 들어올 수 있다 — 네이티브 클라이언트는 null 이고,
 * 손으로 넣은 값이 있으면 배열이 아닐 수도 있다. 화면이 map 을 돌리다 터지는 것보다
 * 빈 배열로 보이는 편이 낫다.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Json 컬럼을 평범한 객체로 좁힌다. 배열·원시값·null 은 전부 null 로 본다 —
 * 화면은 "키: 값" 으로 그리므로 객체가 아니면 그릴 수가 없다.
 */
function toPlainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
