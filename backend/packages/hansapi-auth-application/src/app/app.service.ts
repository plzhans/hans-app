import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { App, AppApiKey, AppClient, AppMember, AppRole } from '@hansapi/data';

import { UserRepository } from '../repository/user.repository';
import { randomToken, sha256hex } from '../token/crypto.util';
import { APP_LIMIT_BY_TIER, CLIENT_LIMIT_PER_APP } from './app.constants';
import { AppRepository } from './app.repository';

/** 앱 상세(키·클라이언트·멤버 포함). */
export type AppDetail = App & {
  apiKeys: AppApiKey[];
  clients: AppClient[];
  members: AppMember[];
};

/** API 키 발급 결과. plainKey 는 이때 딱 한 번만 반환된다(이후 조회 불가). */
export interface CreatedApiKey {
  apiKey: AppApiKey;
  plainKey: string;
}

/** 클라이언트 생성 결과. plainSecret 은 이때 딱 한 번만 반환된다. */
export interface CreatedClient {
  client: AppClient;
  plainSecret: string;
}

/** 클라이언트 시크릿 원문·해시·표시suffix 를 만든다. */
function genClientSecret(): { plain: string; hash: string; suffix: string } {
  const plain = `cs_${randomToken(24)}`;
  return { plain, hash: sha256hex(plain), suffix: plain.slice(-4) };
}

/** 역할 서열(권한 판정용). */
const ROLE_RANK: Record<AppRole, number> = {
  [AppRole.OWNER]: 3,
  [AppRole.ADMIN]: 2,
  [AppRole.MEMBER]: 1,
};

/**
 * 앱(개발자 플랫폼) 서비스. 접근은 멤버십(AppMember)의 역할로 판정한다.
 * 지금은 생성자 1명(OWNER)만 있으며, 초대는 추후 확장한다.
 * - 읽기(목록·상세): 멤버면 가능
 * - 쓰기(키·클라이언트): OWNER·ADMIN
 * - 앱 삭제: OWNER
 */
@Injectable()
export class AppService {
  constructor(
    private readonly users: UserRepository,
    private readonly apps: AppRepository,
  ) {}

  listApps(userId: number): Promise<App[]> {
    return this.apps.listAppsForUser(userId);
  }

  /** 앱 생성. 등급별 한도(내가 OWNER 인 앱 수)를 초과하면 거부한다. */
  async createApp(userId: number, name: string): Promise<App> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    const limit = APP_LIMIT_BY_TIER[user.tier];
    if (limit !== null) {
      const count = await this.apps.countOwnerApps(userId);
      if (count >= limit) {
        throw new ForbiddenException(
          `앱 생성 한도(${limit}개)를 초과했습니다. 등급을 올리면 더 만들 수 있습니다.`,
        );
      }
    }
    return this.apps.createAppWithOwner(userId, name.trim());
  }

  async getApp(userId: number, appId: number): Promise<AppDetail> {
    await this.assertMember(userId, appId);
    const app = await this.apps.getDetail(appId);
    if (!app) {
      throw new NotFoundException('앱을 찾을 수 없습니다.');
    }
    return app;
  }

  /** 앱 이름 변경. ADMIN 이상. */
  async renameApp(userId: number, appId: number, name: string): Promise<App> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    return this.apps.renameApp(appId, name.trim());
  }

  async deleteApp(userId: number, appId: number): Promise<void> {
    await this.assertMember(userId, appId, AppRole.OWNER);
    await this.apps.delete(appId);
  }

  // ---- API 키 ----

  /** 서비스 키 발급/재발급. 앱당 1개라 기존 키를 교체한다. plainKey 는 이때만 반환. */
  async issueApiKey(userId: number, appId: number): Promise<CreatedApiKey> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    await this.apps.deleteAllApiKeys(appId); // 재발급: 기존 교체
    const plainKey = `sk_${randomToken(24)}`;
    const keyPrefix = plainKey.slice(0, 11); // sk_ + 앞 8자
    const apiKey = await this.apps.createApiKey({
      appId,
      name: 'service',
      keyPrefix,
      keyHash: sha256hex(plainKey),
    });
    return { apiKey, plainKey };
  }

  async listApiKeys(userId: number, appId: number): Promise<AppApiKey[]> {
    await this.assertMember(userId, appId);
    return this.apps.listApiKeys(appId);
  }

  async deleteApiKey(
    userId: number,
    appId: number,
    keyId: number,
  ): Promise<void> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const deleted = await this.apps.deleteApiKey(appId, keyId);
    if (deleted === 0) {
      throw new NotFoundException('API 키를 찾을 수 없습니다.');
    }
  }

  // ---- 클라이언트 ----

  /** 클라이언트 등록(앱당 1개). client secret 원문은 이때만 반환. */
  async createClient(
    userId: number,
    appId: number,
    input: { name: string; origins: string[]; redirectUris: string[] },
  ): Promise<CreatedClient> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const existing = await this.apps.countClients(appId);
    if (existing >= CLIENT_LIMIT_PER_APP) {
      throw new ConflictException(
        `클라이언트는 앱당 ${CLIENT_LIMIT_PER_APP}개만 등록할 수 있습니다. 더 필요하면 앱을 분리하세요.`,
      );
    }
    const secret = genClientSecret();
    const client = await this.apps.createClient({
      appId,
      clientId: `cl_${randomToken(15)}`,
      name: input.name.trim(),
      origins: normalizeList(input.origins),
      redirectUris: normalizeList(input.redirectUris),
      clientSecretHash: secret.hash,
      secretSuffix: secret.suffix,
      secretCreatedAt: new Date(),
    });
    return { client, plainSecret: secret.plain };
  }

  /** 클라이언트 시크릿 재발급. 새 원문은 이때만 반환. */
  async regenerateClientSecret(
    userId: number,
    appId: number,
    clientPk: number,
  ): Promise<string> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const secret = genClientSecret();
    const n = await this.apps.updateClientSecret(appId, clientPk, {
      clientSecretHash: secret.hash,
      secretSuffix: secret.suffix,
      secretCreatedAt: new Date(),
    });
    if (n === 0) {
      throw new NotFoundException('클라이언트를 찾을 수 없습니다.');
    }
    return secret.plain;
  }

  async listClients(userId: number, appId: number): Promise<AppClient[]> {
    await this.assertMember(userId, appId);
    return this.apps.listClients(appId);
  }

  async updateClient(
    userId: number,
    appId: number,
    clientPk: number,
    input: { name?: string; origins?: string[]; redirectUris?: string[] },
  ): Promise<void> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const updated = await this.apps.updateClient(appId, clientPk, {
      name: input.name?.trim(),
      origins: input.origins ? normalizeList(input.origins) : undefined,
      redirectUris: input.redirectUris
        ? normalizeList(input.redirectUris)
        : undefined,
    });
    if (updated === 0) {
      throw new NotFoundException('클라이언트를 찾을 수 없습니다.');
    }
  }

  async deleteClient(
    userId: number,
    appId: number,
    clientPk: number,
  ): Promise<void> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const deleted = await this.apps.deleteClient(appId, clientPk);
    if (deleted === 0) {
      throw new NotFoundException('클라이언트를 찾을 수 없습니다.');
    }
  }

  /** 멤버십 + 최소 역할 검증. 멤버가 아니면 404(존재 노출 방지), 권한 부족이면 403. */
  private async assertMember(
    userId: number,
    appId: number,
    minRole: AppRole = AppRole.MEMBER,
  ): Promise<AppMember> {
    const membership = await this.apps.getMembership(userId, appId);
    if (!membership) {
      throw new NotFoundException('앱을 찾을 수 없습니다.');
    }
    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException('권한이 없습니다.');
    }
    return membership;
  }
}

/** 문자열 목록 정규화(공백 제거·빈값 제거·중복 제거). */
function normalizeList(list: string[]): string[] {
  return Array.from(
    new Set(list.map((s) => s.trim()).filter((s) => s.length > 0)),
  );
}
