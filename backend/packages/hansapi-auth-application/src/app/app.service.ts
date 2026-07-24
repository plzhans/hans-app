import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  App,
  AppApiKey,
  AppClient,
  AppClientType,
  AppMember,
  AppRole,
  AppStatus,
  UserTier,
} from '@hansapi/data';

import { UserRepository } from '../repository/user.repository';
import { randomToken, sha256hex } from '../token/crypto.util';
import { APP_LIMIT_BY_TIER } from './app.constants';
import { AppRepository } from './app.repository';
import { AccessCache } from './access-cache.service';

/** 앱 상세(키·클라이언트·멤버 포함). */
export type AppDetail = App & {
  apiKeys: AppApiKey[];
  clients: AppClient[];
  members: AppMember[];
};

/** 사용자 등급과 그 등급이 정하는 앱 한도. appLimit 이 null 이면 무제한(UNLIMITED). */
export interface UserTierInfo {
  email: string;
  tier: UserTier;
  appLimit: number | null;
  appCount: number;
}

/** API 키 발급 결과. plainKey 는 이때 딱 한 번만 반환된다(이후 조회 불가). */
export interface CreatedApiKey {
  apiKey: AppApiKey;
  plainKey: string;
}

/** 클라이언트 생성 결과. plainSecret 은 WEB 일 때만, 그것도 이때 딱 한 번 반환된다. */
export interface CreatedClient {
  client: AppClient;
  plainSecret?: string;
}

/** 클라이언트 생성 입력. type 에 따라 필요한 필드가 다르다(서비스에서 검증). */
export interface CreateClientInput {
  type: AppClientType;
  name: string;
  /** 공개 식별자. 지정하면 그 값으로(멀티 환경에서 고정), 비우면 랜덤 발급. */
  clientId?: string;
  /** WEB */
  origins?: string[];
  redirectUris?: string[];
  /** IOS */
  bundleId?: string;
  teamId?: string;
  /** ANDROID */
  packageName?: string;
  fingerprints?: string[];
}

/** 클라이언트 수정 입력(부분). 대상 클라이언트의 type 에 맞는 필드만 반영된다. */
export interface UpdateClientInput {
  name?: string;
  origins?: string[];
  redirectUris?: string[];
  bundleId?: string;
  teamId?: string;
  packageName?: string;
  fingerprints?: string[];
}

/**
 * 클라이언트 시크릿 원문·해시·표시suffix 를 만든다.
 * client_id 와 항상 함께 쓰이므로 별도 접두사를 두지 않는다(순수 랜덤).
 */
function genClientSecret(): { plain: string; hash: string; suffix: string } {
  const plain = randomToken(24);
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
    private readonly cache: AccessCache,
  ) {}

  listApps(userId: number): Promise<App[]> {
    return this.apps.listAppsForUser(userId);
  }

  /**
   * 이메일로 사용자 id 를 찾는다. **로그인 컨텍스트가 없는 호출자(CLI)** 가 소유자를 지정할 때 쓴다.
   * 저장소를 밖으로 열지 않으려고 서비스가 대신 해석해 준다.
   */
  async resolveUserIdByEmail(email: string): Promise<number> {
    const user = await this.users.findByEmail(email.trim());
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user.id;
  }

  /**
   * 사용자 등급 조회. 현재 등급과 앱 한도, 이미 쓴 개수를 함께 준다.
   * 한도 해석(APP_LIMIT_BY_TIER)이 여기 있으므로 호출자가 다시 계산하지 않게 한다.
   */
  async getUserTier(userId: number): Promise<UserTierInfo> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return {
      email: user.email,
      tier: user.tier,
      appLimit: APP_LIMIT_BY_TIER[user.tier],
      appCount: await this.apps.countOwnerApps(userId),
    };
  }

  /**
   * 사용자 등급 변경. **운영자 전용**이다 — 등급이 앱 생성 한도를 정하므로 본인이 올릴 수
   * 있으면 한도가 의미를 잃는다. 그래서 포털·API 에는 통로를 두지 않고 CLI 로만 연다.
   *
   * 낮추는 것도 막지 않는다. 이미 만든 앱은 그대로 두고 **다음 생성부터** 걸린다
   * (createApp 이 생성 시점에만 한도를 본다). 이미 한도를 넘긴 상태가 될 수 있는데,
   * 그게 앱을 강제로 지우는 것보다 낫다.
   */
  async setUserTier(userId: number, tier: UserTier): Promise<UserTierInfo> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const updated = await this.users.updateTier(userId, tier);
    return {
      email: updated.email,
      tier: updated.tier,
      appLimit: APP_LIMIT_BY_TIER[updated.tier],
      appCount: await this.apps.countOwnerApps(userId),
    };
  }

  /** 앱 생성. 등급별 한도(내가 OWNER 인 앱 수)를 초과하면 거부한다. */
  async createApp(userId: number, name: string): Promise<App> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const limit = APP_LIMIT_BY_TIER[user.tier];
    if (limit !== null) {
      const count = await this.apps.countOwnerApps(userId);
      if (count >= limit) {
        throw new ForbiddenException(
          `App limit reached (${limit}). Upgrade your tier to create more.`,
        );
      }
    }
    return this.apps.createAppWithOwner(userId, name.trim());
  }

  async getApp(userId: number, appId: number): Promise<AppDetail> {
    await this.assertMember(userId, appId);
    const app = await this.apps.getDetail(appId);
    if (!app) {
      throw new NotFoundException('App not found.');
    }
    return app;
  }

  /** 앱 수정(이름·상태). ADMIN 이상. */
  async updateApp(
    userId: number,
    appId: number,
    input: { name?: string; status?: AppStatus },
  ): Promise<App> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    // 인증은 키·클라이언트의 status 만 보므로 앱 이름/상태 변경은 접근 캐시에 영향이 없다.
    return this.apps.updateApp(appId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
  }

  /** 앱 삭제. 소프트 삭제(deletedAt) + 하위 키·클라이언트 DISABLED. 완전 삭제는 배치가 한다. */
  async deleteApp(userId: number, appId: number): Promise<void> {
    await this.assertMember(userId, appId, AppRole.OWNER);
    // 하위 키·클라이언트가 DISABLED 되므로, 캐시된 항목을 키 단위로 무효화한다.
    const [keys, clients] = await Promise.all([
      this.apps.listApiKeys(appId),
      this.apps.listClients(appId),
    ]);
    await this.apps.softDelete(appId);
    await Promise.all([
      ...keys.map((k) => this.cache.invalidateApiKey(appId, k.id)),
      ...clients.map((c) => this.cache.invalidateClient(c.clientId)),
    ]);
  }

  // ---- API 키 ----

  /**
   * 서비스 키 발급. 앱당 상한(App.apiKeyLimit, 기본 3)을 넘으면 거부한다.
   * 이름을 지정해 여러 개 발급할 수 있다(rotation). plainKey 는 이때만 반환.
   */
  async createApiKey(
    userId: number,
    appId: number,
    name: string,
  ): Promise<CreatedApiKey> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const app = await this.apps.findApp(appId);
    if (!app) {
      throw new NotFoundException('App not found.');
    }
    const count = await this.apps.countApiKeys(appId);
    if (count >= app.apiKeyLimit) {
      throw new ForbiddenException(
        `Service key limit reached (${app.apiKeyLimit} per app).`,
      );
    }
    // 키 원문에 appId·행 id 를 박는다: sk_{appId}_{keyId}_{random}.
    //  - 키값만 봐도 어느 앱/키인지 식별 가능(로그·유출 추적)
    //  - 검증 시 파싱한 id 로 O(1) 조회 후 해시 비교(스캔 불필요)
    // prefix(표시·조회용)는 랜덤을 뺀 sk_{appId}_{keyId}. hash 는 원문 전체의 SHA-256.
    let plainKey = '';
    const apiKey = await this.apps.createApiKeyWithId(
      appId,
      name.trim(),
      (id) => {
        plainKey = `sk_${appId}_${id}_${randomToken(24)}`;
        return { keyPrefix: `sk_${appId}_${id}`, keyHash: sha256hex(plainKey) };
      },
    );
    // 새로 만든 id 라 캐시에 있을 수 없다 — 무효화 불필요.
    return { apiKey, plainKey };
  }

  /** 서비스 키 재발급. 행(id)은 유지하고 값·해시만 교체한다(형식 sk_{appId}_{keyId}_{rand}). */
  async regenerateApiKey(
    userId: number,
    appId: number,
    keyId: number,
  ): Promise<CreatedApiKey> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const key = await this.apps.findApiKey(appId, keyId);
    if (!key) {
      throw new NotFoundException('API key not found.');
    }
    const plainKey = `sk_${appId}_${keyId}_${randomToken(24)}`;
    const apiKey = await this.apps.updateApiKeyHash(keyId, {
      keyHash: sha256hex(plainKey),
      keyPrefix: `sk_${appId}_${keyId}`,
    });
    await this.cache.invalidateApiKey(appId, keyId);
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
      throw new NotFoundException('API key not found.');
    }
    await this.cache.invalidateApiKey(appId, keyId);
  }

  // ---- 클라이언트 ----

  /**
   * 클라이언트 등록. 앱당 여러 개(플랫폼별). type 에 따라 필드가 갈린다.
   * WEB 만 secret 을 발급하며 원문은 이때만 반환된다(네이티브는 PKCE, secret 없음).
   */
  async createClient(
    userId: number,
    appId: number,
    input: CreateClientInput,
  ): Promise<CreatedClient> {
    await this.assertMember(userId, appId, AppRole.ADMIN);

    // type 별 컬럼과 (WEB 만) 시크릿을 먼저 계산한다.
    let extra: {
      origins?: string[];
      redirectUris?: string[];
      clientSecretHash?: string;
      secretSuffix?: string;
      secretCreatedAt?: Date;
      config?: Record<string, unknown>;
    };
    let plainSecret: string | undefined;

    switch (input.type) {
      case AppClientType.WEB: {
        const secret = genClientSecret();
        plainSecret = secret.plain;
        extra = {
          origins: normalizeList(input.origins ?? []),
          redirectUris: normalizeList(input.redirectUris ?? []),
          clientSecretHash: secret.hash,
          secretSuffix: secret.suffix,
          secretCreatedAt: new Date(),
        };
        break;
      }
      case AppClientType.IOS: {
        const bundleId = input.bundleId?.trim();
        if (!bundleId) {
          throw new BadRequestException('Bundle ID is required.');
        }
        const teamId = input.teamId?.trim();
        extra = { config: { bundleId, ...(teamId ? { teamId } : {}) } };
        break;
      }
      case AppClientType.ANDROID: {
        const packageName = input.packageName?.trim();
        if (!packageName) {
          throw new BadRequestException('Package name is required.');
        }
        extra = {
          config: {
            packageName,
            fingerprints: normalizeList(input.fingerprints ?? []),
          },
        };
        break;
      }
      default:
        throw new BadRequestException('Unknown client type.');
    }

    const fields = {
      appId,
      name: input.name.trim(),
      type: input.type,
      ...extra,
    };
    const specified = input.clientId?.trim();

    // 지정: cl_fixed_{입력값}. 미지정: cl_{appId}_{rowId}-{rand} (행 id 기반, 트랜잭션).
    // clientId 전역 유일 → 중복(주로 지정값)이면 P2002 를 409 로 변환한다.
    const client = await (
      specified
        ? this.apps.createClient({
            ...fields,
            clientId: `cl_fixed_${specified}`,
          })
        : this.apps.createClientAutoId(fields, randomToken(9))
    ).catch((e: unknown) => {
      if (isUniqueViolation(e)) {
        throw new ConflictException('Client ID already in use.');
      }
      throw e;
    });

    // 지정 clientId 였다면 "없음"이 캐싱돼 있을 수 있으므로 비운다.
    await this.cache.invalidateClient(client.clientId);
    return { client, plainSecret };
  }

  /** 클라이언트 시크릿 재발급. WEB 만 가능. 새 원문은 이때만 반환. */
  async regenerateClientSecret(
    userId: number,
    appId: number,
    clientPk: number,
  ): Promise<string> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const client = await this.apps.findClient(appId, clientPk);
    if (!client) {
      throw new NotFoundException('Client not found.');
    }
    if (client.type !== AppClientType.WEB) {
      throw new BadRequestException(
        'Native clients have no secret (PKCE is used).',
      );
    }
    const secret = genClientSecret();
    await this.apps.updateClientSecret(appId, clientPk, {
      clientSecretHash: secret.hash,
      secretSuffix: secret.suffix,
      secretCreatedAt: new Date(),
    });
    await this.cache.invalidateClient(client.clientId);
    return secret.plain;
  }

  async listClients(userId: number, appId: number): Promise<AppClient[]> {
    await this.assertMember(userId, appId);
    return this.apps.listClients(appId);
  }

  /** 클라이언트 수정. 대상의 type 에 맞는 필드만 반영한다. */
  async updateClient(
    userId: number,
    appId: number,
    clientPk: number,
    input: UpdateClientInput,
  ): Promise<void> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    const client = await this.apps.findClient(appId, clientPk);
    if (!client) {
      throw new NotFoundException('Client not found.');
    }

    const data: {
      name?: string;
      origins?: string[];
      redirectUris?: string[];
      config?: Record<string, unknown>;
    } = {};
    if (input.name !== undefined) {
      data.name = input.name.trim();
    }
    switch (client.type) {
      case AppClientType.WEB:
        if (input.origins) data.origins = normalizeList(input.origins);
        if (input.redirectUris)
          data.redirectUris = normalizeList(input.redirectUris);
        break;
      case AppClientType.IOS:
        if (input.bundleId !== undefined || input.teamId !== undefined) {
          const cfg = (client.config as Record<string, unknown> | null) ?? {};
          const bundleId =
            input.bundleId?.trim() ?? (cfg.bundleId as string | undefined);
          const teamId =
            input.teamId?.trim() ?? (cfg.teamId as string | undefined);
          data.config = { bundleId, ...(teamId ? { teamId } : {}) };
        }
        break;
      case AppClientType.ANDROID:
        if (input.packageName || input.fingerprints) {
          const cfg = (client.config as Record<string, unknown> | null) ?? {};
          data.config = {
            packageName: input.packageName?.trim() ?? cfg.packageName,
            fingerprints: input.fingerprints
              ? normalizeList(input.fingerprints)
              : (cfg.fingerprints ?? []),
          };
        }
        break;
    }

    const updated = await this.apps.updateClient(appId, clientPk, data);
    if (updated === 0) {
      throw new NotFoundException('Client not found.');
    }
    await this.cache.invalidateClient(client.clientId);
  }

  async deleteClient(
    userId: number,
    appId: number,
    clientPk: number,
  ): Promise<void> {
    await this.assertMember(userId, appId, AppRole.ADMIN);
    // 캐시 무효화에 공개 clientId 가 필요하므로 삭제 전에 읽어 둔다.
    const client = await this.apps.findClient(appId, clientPk);
    if (!client) {
      throw new NotFoundException('Client not found.');
    }
    await this.apps.deleteClient(appId, clientPk);
    await this.cache.invalidateClient(client.clientId);
  }

  /** 멤버십 + 최소 역할 검증. 멤버가 아니면 404(존재 노출 방지), 권한 부족이면 403. */
  private async assertMember(
    userId: number,
    appId: number,
    minRole: AppRole = AppRole.MEMBER,
  ): Promise<AppMember> {
    const membership = await this.apps.getMembership(userId, appId);
    if (!membership) {
      throw new NotFoundException('App not found.');
    }
    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException('Insufficient permissions.');
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

/** Prisma 고유 제약 위반(P2002). AppClient 의 유일 컬럼은 clientId 뿐이다. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === 'P2002'
  );
}
