import { Injectable } from '@nestjs/common';
import {
  App,
  AppApiKey,
  AppClient,
  AppMember,
  AppRole,
  PrismaService,
} from '@hansapi/data';

/** 앱(App)과 하위 리소스 저장소. 접근은 멤버십(AppMember)으로 판정한다. */
@Injectable()
export class AppRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- App / 멤버십 ----

  /** 내가 멤버인 앱 목록. */
  listAppsForUser(userId: number): Promise<App[]> {
    return this.prisma.app.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 내가 OWNER 인 앱 수(등급 한도 판정용). */
  countOwnerApps(userId: number): Promise<number> {
    return this.prisma.appMember.count({
      where: { userId, role: AppRole.OWNER },
    });
  }

  /** 앱 + 생성자를 OWNER 멤버로 한 번에 만든다(트랜잭션). */
  createAppWithOwner(userId: number, name: string): Promise<App> {
    return this.prisma.app.create({
      data: {
        name,
        createdBy: userId,
        members: { create: { userId, role: AppRole.OWNER } },
      },
    });
  }

  /** 사용자의 앱 내 멤버십(역할). 멤버가 아니면 null. */
  getMembership(userId: number, appId: number): Promise<AppMember | null> {
    return this.prisma.appMember.findUnique({
      where: { appId_userId: { appId, userId } },
    });
  }

  /** 앱 상세(키·클라이언트·멤버 포함). */
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

  /** 앱 이름 변경. */
  renameApp(appId: number, name: string): Promise<App> {
    return this.prisma.app.update({ where: { id: appId }, data: { name } });
  }

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

  listApiKeys(appId: number): Promise<AppApiKey[]> {
    return this.prisma.appApiKey.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
    });
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

  createClient(input: {
    appId: number;
    clientId: string;
    name: string;
    origins: string[];
    redirectUris: string[];
    clientSecretHash: string;
    secretSuffix: string;
    secretCreatedAt: Date;
  }): Promise<AppClient> {
    return this.prisma.appClient.create({
      data: {
        appId: input.appId,
        clientId: input.clientId,
        name: input.name,
        origins: input.origins,
        redirectUris: input.redirectUris,
        clientSecretHash: input.clientSecretHash,
        secretSuffix: input.secretSuffix,
        secretCreatedAt: input.secretCreatedAt,
      },
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

  updateClient(
    appId: number,
    clientPk: number,
    data: { name?: string; origins?: string[]; redirectUris?: string[] },
  ): Promise<number> {
    return this.prisma.appClient
      .updateMany({ where: { id: clientPk, appId }, data })
      .then((r) => r.count);
  }

  deleteClient(appId: number, clientPk: number): Promise<number> {
    return this.prisma.appClient
      .deleteMany({ where: { id: clientPk, appId } })
      .then((r) => r.count);
  }
}
