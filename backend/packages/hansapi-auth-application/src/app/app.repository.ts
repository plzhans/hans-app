import { Injectable } from '@nestjs/common';
import {
  App,
  AppApiKey,
  AppClient,
  AppClientType,
  AppMember,
  AppRole,
  AppStatus,
  Prisma,
  PrismaService,
} from '@hansapi/data';

/** 앱(App)과 하위 리소스 저장소. 접근은 멤버십(AppMember)으로 판정한다. */
@Injectable()
export class AppRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- App / 멤버십 ----

  /** 내가 멤버인 앱 목록(삭제된 앱도 포함 — 표시는 하되 진입은 막는다). */
  listAppsForUser(userId: number): Promise<App[]> {
    return this.prisma.app.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 내가 OWNER 인 앱 수(등급 한도 판정용). 삭제된 앱은 한도에서 뺀다. */
  countOwnerApps(userId: number): Promise<number> {
    return this.prisma.appMember.count({
      where: { userId, role: AppRole.OWNER, app: { deletedAt: null } },
    });
  }

  /** 앱 + 생성자를 OWNER 멤버로 한 번에 만든다(트랜잭션). */
  createAppWithOwner(
    userId: number,
    name: string,
    status: AppStatus,
  ): Promise<App> {
    return this.prisma.app.create({
      data: {
        name,
        status,
        createdBy: userId,
        members: { create: { userId, role: AppRole.OWNER } },
      },
    });
  }

  /**
   * 앱 승인: 앱과 그 하위 **PENDING** 키·클라이언트를 ACTIVE 로 올린다(트랜잭션).
   * DISABLED 는 건드리지 않는다 — 사용자가 끈 것을 승인이 되살리면 안 된다.
   */
  approve(appId: number): Promise<void> {
    return this.prisma
      .$transaction(async (tx) => {
        await tx.app.update({
          where: { id: appId },
          data: { status: AppStatus.ACTIVE },
        });
        await tx.appApiKey.updateMany({
          where: { appId, status: AppStatus.PENDING },
          data: { status: AppStatus.ACTIVE },
        });
        await tx.appClient.updateMany({
          where: { appId, status: AppStatus.PENDING },
          data: { status: AppStatus.ACTIVE },
        });
      })
      .then(() => undefined);
  }

  /** 사용자의 앱 내 멤버십(역할). 멤버가 아니면 null. */
  getMembership(userId: number, appId: number): Promise<AppMember | null> {
    return this.prisma.appMember.findUnique({
      where: { appId_userId: { appId, userId } },
    });
  }

  /** 앱 상세(키·클라이언트·멤버 포함). 삭제된 앱도 반환하되, 마스킹은 상위(컨트롤러)가 한다. */
  getDetail(appId: number): Promise<
    | (App & {
        apiKeys: AppApiKey[];
        clients: AppClient[];
        members: AppMember[];
      })
    | null
  > {
    return this.prisma.app.findUnique({
      where: { id: appId },
      include: { apiKeys: true, clients: true, members: true },
    });
  }

  /** 앱 단건(상한 판정 등, 삭제된 앱 제외). 멤버 검증은 서비스가 별도로 한다. */
  findApp(appId: number): Promise<App | null> {
    return this.prisma.app.findFirst({ where: { id: appId, deletedAt: null } });
  }

  /** 앱 수정(이름·상태). */
  updateApp(
    appId: number,
    data: { name?: string; status?: AppStatus },
  ): Promise<App> {
    return this.prisma.app.update({ where: { id: appId }, data });
  }

  /**
   * 소프트 삭제. 앱·키·클라이언트 status 를 DISABLED 로 내리고(인증은 status 만 보면 된다),
   * 앱에 deletedAt 을 찍는다(목록 숨김·N일 후 완전삭제 타이밍용). 트랜잭션.
   */
  softDelete(appId: number): Promise<void> {
    return this.prisma
      .$transaction(async (tx) => {
        await tx.app.update({
          where: { id: appId },
          data: { status: AppStatus.DISABLED, deletedAt: new Date() },
        });
        await tx.appApiKey.updateMany({
          where: { appId },
          data: { status: AppStatus.DISABLED },
        });
        await tx.appClient.updateMany({
          where: { appId },
          data: { status: AppStatus.DISABLED },
        });
      })
      .then(() => undefined);
  }

  /** 하드 삭제(행 제거, Cascade). 배치의 완전 정리용. */
  delete(appId: number): Promise<void> {
    return this.prisma.app
      .delete({ where: { id: appId } })
      .then(() => undefined);
  }

  // ---- AppApiKey ----

  createApiKey(input: {
    appId: number;
    name: string;
    keyPrefix: string;
    keyHash: string;
  }): Promise<AppApiKey> {
    return this.prisma.appApiKey.create({ data: input });
  }

  /**
   * 서비스 키를 **행 id 기반**으로 발급한다. 키 원문에 appId·행 id 를 박으려면 id 가 필요한데
   * id 는 insert 후에야 정해지므로 트랜잭션으로 (임시값 insert) → (id 로 만든 prefix·hash 로 update).
   * build(id) 는 서비스가 넘긴다(원문 조립·해시는 서비스 책임).
   */
  createApiKeyWithId(
    appId: number,
    name: string,
    status: AppStatus,
    build: (id: number) => { keyPrefix: string; keyHash: string },
  ): Promise<AppApiKey> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.appApiKey.create({
        data: {
          appId,
          name,
          status,
          keyPrefix: 'pending',
          keyHash: 'pending',
        },
      });
      const { keyPrefix, keyHash } = build(created.id);
      return tx.appApiKey.update({
        where: { id: created.id },
        data: { keyPrefix, keyHash },
      });
    });
  }

  listApiKeys(appId: number): Promise<AppApiKey[]> {
    return this.prisma.appApiKey.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 앱 내 API 키 단건(재발급 검증용). */
  findApiKey(appId: number, keyId: number): Promise<AppApiKey | null> {
    return this.prisma.appApiKey.findFirst({ where: { id: keyId, appId } });
  }

  /** API 키 재발급(행 유지, 해시·prefix 교체). id 로 갱신하므로 소유 검증은 서비스가 선행한다. */
  updateApiKeyHash(
    keyId: number,
    data: { keyHash: string; keyPrefix: string },
  ): Promise<AppApiKey> {
    return this.prisma.appApiKey.update({ where: { id: keyId }, data });
  }

  countApiKeys(appId: number): Promise<number> {
    return this.prisma.appApiKey.count({ where: { appId } });
  }

  deleteApiKey(appId: number, keyId: number): Promise<number> {
    return this.prisma.appApiKey
      .deleteMany({ where: { id: keyId, appId } })
      .then((r) => r.count);
  }

  /** 앱의 API 키 전부 삭제(발급/재발급 시 교체용). */
  deleteAllApiKeys(appId: number): Promise<number> {
    return this.prisma.appApiKey
      .deleteMany({ where: { appId } })
      .then((r) => r.count);
  }

  // ---- AppClient ----

  countClients(appId: number): Promise<number> {
    return this.prisma.appClient.count({ where: { appId } });
  }

  /**
   * 클라이언트 생성. type 에 따라 채워지는 필드가 다르다.
   * - WEB: origins·redirectUris·secret*(해시/suffix/시각)
   * - IOS/ANDROID: config(식별자). secret 없음.
   * undefined 필드는 넣지 않아 컬럼이 null 로 남는다. clientId 는 호출자가 정한다.
   */
  createClient(input: ClientCreateFields): Promise<AppClient> {
    return this.prisma.appClient.create({ data: buildClientData(input) });
  }

  /**
   * clientId 를 **행 id 기반**으로 자동 발급하는 생성.
   * 행 id 는 insert 후에야 정해지므로 트랜잭션으로 (임시 clientId 로 insert) → (최종값으로 update).
   * 최종 형식: `cl_{appId}_{rowId}-{rand}`.
   */
  createClientAutoId(
    input: Omit<ClientCreateFields, 'clientId'>,
    rand: string,
  ): Promise<AppClient> {
    return this.prisma.$transaction(async (tx) => {
      const placeholder = `cl_${input.appId}_tmp-${rand}`;
      const created = await tx.appClient.create({
        data: buildClientData({ ...input, clientId: placeholder }),
      });
      return tx.appClient.update({
        where: { id: created.id },
        data: { clientId: `cl_${input.appId}_${created.id}-${rand}` },
      });
    });
  }

  /** 클라이언트 시크릿 재발급(clientId 유지, 해시·표시suffix·발급시각 교체). */
  updateClientSecret(
    appId: number,
    clientPk: number,
    data: {
      clientSecretHash: string;
      secretSuffix: string;
      secretCreatedAt: Date;
    },
  ): Promise<number> {
    return this.prisma.appClient
      .updateMany({ where: { id: clientPk, appId }, data })
      .then((r) => r.count);
  }

  listClients(appId: number): Promise<AppClient[]> {
    return this.prisma.appClient.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 앱 내 클라이언트 단건(타입 판정 등). */
  findClient(appId: number, clientPk: number): Promise<AppClient | null> {
    return this.prisma.appClient.findFirst({ where: { id: clientPk, appId } });
  }

  /** 공개 clientId 로 클라이언트 단건 조회(인증 검증용). */
  findClientByClientId(clientId: string): Promise<AppClient | null> {
    return this.prisma.appClient.findUnique({ where: { clientId } });
  }

  updateClient(
    appId: number,
    clientPk: number,
    data: {
      name?: string;
      origins?: string[];
      redirectUris?: string[];
      config?: Record<string, unknown>;
    },
  ): Promise<number> {
    const { config, ...rest } = data;
    return this.prisma.appClient
      .updateMany({
        where: { id: clientPk, appId },
        data: {
          ...rest,
          ...(config ? { config: config as Prisma.InputJsonValue } : {}),
        },
      })
      .then((r) => r.count);
  }

  deleteClient(appId: number, clientPk: number): Promise<number> {
    return this.prisma.appClient
      .deleteMany({ where: { id: clientPk, appId } })
      .then((r) => r.count);
  }
}

/** 클라이언트 생성 필드(type 별 선택 컬럼 포함). */
interface ClientCreateFields {
  appId: number;
  clientId: string;
  name: string;
  type: AppClientType;
  status: AppStatus;
  origins?: string[];
  redirectUris?: string[];
  clientSecretHash?: string;
  secretSuffix?: string;
  secretCreatedAt?: Date;
  config?: Record<string, unknown>;
}

/** ClientCreateFields → Prisma create data. undefined 필드는 넣지 않아 컬럼이 null 로 남는다. */
function buildClientData(
  input: ClientCreateFields,
): Prisma.AppClientCreateManyInput {
  return {
    appId: input.appId,
    clientId: input.clientId,
    name: input.name,
    type: input.type,
    status: input.status,
    ...(input.origins ? { origins: input.origins } : {}),
    ...(input.redirectUris ? { redirectUris: input.redirectUris } : {}),
    ...(input.clientSecretHash
      ? { clientSecretHash: input.clientSecretHash }
      : {}),
    ...(input.secretSuffix ? { secretSuffix: input.secretSuffix } : {}),
    ...(input.secretCreatedAt
      ? { secretCreatedAt: input.secretCreatedAt }
      : {}),
    ...(input.config ? { config: input.config as Prisma.InputJsonValue } : {}),
  };
}
