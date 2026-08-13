import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AppService, Auth, AuthType, CurrentUser, reviewStateOf } from '@hansapp/auth-application';
import type { App, AppApiKey, AppClient, AuthUser } from '@hansapp/auth-application';

import {
  ApiKeySummaryDto,
  AppDetailDto,
  AppSummaryDto,
  ClientDto,
  CreateApiKeyDto,
  CreateAppDto,
  CreateClientDto,
  CreatedApiKeyDto,
  CreatedClientDto,
  SecretResponseDto,
  UpdateAppDto,
  UpdateClientDto,
} from './dto/app.dto';

/**
 * 앱 관리(개발자 플랫폼). 로그인한 사용자가 자기 앱을 등록하고, 앱마다 API 키(서버용)와
 * 클라이언트(브라우저/OAuth: origins·redirectUris)를 관리한다. 모든 리소스는 소유자만 접근한다.
 */
/**
 * **스펙에 싣지 않는다(@ApiExcludeController).** 여기는 우리 개발자 콘솔(hansapp-web)이
 * 부르는 자리다 — 연동하는 쪽이 앱을 만들고 키를 발급하는 것은 화면에서 하지 API 로 하지 않는다.
 *
 * 스펙의 뜻을 한 문장으로 지킨다: **스펙에 있는 것 = 외부가 부를 수 있는 것.**
 * 자사 전용을 실어 두면 문서 쪽에서 다시 걸러야 하고, 정본이 둘이 되면 한쪽만 고치는 사고가 난다.
 */
@ApiExcludeController()
@ApiTags('apps')
@Auth(AuthType.Jwt)
@Controller('apps')
export class AppsController {
  constructor(private readonly apps: AppService) {}

  @Get()
  @ApiOperation({ summary: '내 앱 목록' })
  @ApiOkResponse({ type: [AppSummaryDto] })
  async list(@CurrentUser() user: AuthUser): Promise<AppSummaryDto[]> {
    const apps = await this.apps.listApps(user.userId);
    return apps.map(toAppSummary);
  }

  @Post()
  @ApiOperation({
    summary: '앱 등록',
    description: '등급별 생성 한도를 초과하면 403.',
  })
  @ApiCreatedResponse({ type: AppSummaryDto })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppDto): Promise<AppSummaryDto> {
    return toAppSummary(await this.apps.createApp(user.userId, dto.name));
  }

  @Get(':id')
  @ApiOperation({ summary: '앱 상세(키·클라이언트 포함)' })
  @ApiOkResponse({ type: AppDetailDto })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AppDetailDto> {
    const app = await this.apps.getApp(user.userId, id);
    // 삭제된 앱은 정보를 가려 내려준다(기본정보만, 키·클라이언트는 숨김).
    const deleted = app.deletedAt != null;
    return {
      id: app.id,
      name: app.name,
      status: app.status,
      reviewState: reviewStateOf(app),
      rejectionReason: app.rejectionReason ?? null,
      deletedAt: app.deletedAt ? app.deletedAt.toISOString() : null,
      createdBy: app.createdBy,
      createdAt: app.createdAt.toISOString(),
      apiKeyLimit: app.apiKeyLimit,
      apiKeys: deleted ? [] : app.apiKeys.map(toApiKeySummary),
      clients: deleted ? [] : app.clients.map(toClient),
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: '앱 수정(이름·상태)' })
  @ApiOkResponse({ type: AppSummaryDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppDto,
  ): Promise<AppSummaryDto> {
    return toAppSummary(
      await this.apps.updateApp(user.userId, id, {
        name: dto.name,
        status: dto.status,
      }),
    );
  }

  @Post(':id/review-request')
  @HttpCode(200)
  @ApiOperation({
    summary: '심사 요청',
    description:
      'PENDING 앱을 심사 대기로 올린다. 거절된 앱의 재요청도 이 경로다(사유가 지워지고 다시 심사 중). ' +
      '이미 승인·삭제된 앱이면 400.',
  })
  @ApiOkResponse({ type: AppSummaryDto })
  async requestReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AppSummaryDto> {
    return toAppSummary(await this.apps.requestReviewApp(user.userId, id));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '앱 삭제(즉시, 하위 키·클라이언트 함께 삭제)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.apps.deleteApp(user.userId, id);
  }

  // ---- API 키 ----

  @Post(':id/api-keys')
  @ApiOperation({
    summary: '서비스 키 발급',
    description:
      '이름을 지정해 발급한다. 앱당 상한(App.apiKeyLimit, 기본 3)까지 여러 개 가능. 원문(sk_...)은 이 응답에서만 확인 가능하다.',
  })
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  async createApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreatedApiKeyDto> {
    const { apiKey, plainKey } = await this.apps.createApiKey(user.userId, id, dto.name);
    return {
      id: apiKey.id,
      name: apiKey.name,
      key: plainKey,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt.toISOString(),
    };
  }

  @Post(':id/api-keys/:keyId/regenerate')
  @HttpCode(200)
  @ApiOperation({
    summary: '서비스 키 재발급',
    description:
      '행(id)은 유지하고 값만 새로 만든다. 기존 값은 즉시 무효화. 원문은 이 응답에서만 확인 가능.',
  })
  @ApiOkResponse({ type: CreatedApiKeyDto })
  async regenerateApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('keyId', ParseIntPipe) keyId: number,
  ): Promise<CreatedApiKeyDto> {
    const { apiKey, plainKey } = await this.apps.regenerateApiKey(user.userId, id, keyId);
    return {
      id: apiKey.id,
      name: apiKey.name,
      key: plainKey,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt.toISOString(),
    };
  }

  @Get(':id/api-keys')
  @ApiOperation({ summary: 'API 키 목록' })
  @ApiOkResponse({ type: [ApiKeySummaryDto] })
  async listApiKeys(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApiKeySummaryDto[]> {
    const keys = await this.apps.listApiKeys(user.userId, id);
    return keys.map(toApiKeySummary);
  }

  @Delete(':id/api-keys/:keyId')
  @HttpCode(204)
  @ApiOperation({ summary: 'API 키 삭제' })
  async deleteApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('keyId', ParseIntPipe) keyId: number,
  ): Promise<void> {
    await this.apps.deleteApiKey(user.userId, id, keyId);
  }

  // ---- 클라이언트 ----

  @Post(':id/clients')
  @ApiOperation({
    summary: '클라이언트 등록(플랫폼별, 앱당 여러 개)',
    description:
      'type=WEB|IOS|ANDROID. WEB 만 client secret 을 발급하며 이 응답에서만 확인 가능하다(네이티브는 PKCE).',
  })
  @ApiCreatedResponse({ type: CreatedClientDto })
  async createClient(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClientDto,
  ): Promise<CreatedClientDto> {
    const { client, plainSecret } = await this.apps.createClient(user.userId, id, {
      type: dto.type,
      name: dto.name,
      clientId: dto.clientId,
      origins: dto.origins,
      redirectUris: dto.redirectUris,
      bundleId: dto.bundleId,
      teamId: dto.teamId,
      packageName: dto.packageName,
      fingerprints: dto.fingerprints,
    });
    return { ...toClient(client), secret: plainSecret };
  }

  @Post(':id/clients/:clientPk/secret')
  @HttpCode(200)
  @ApiOperation({
    summary: '클라이언트 보안 비밀번호 재발급',
    description: '기존 시크릿은 즉시 무효화된다. 새 원문은 이 응답에서만 확인 가능하다.',
  })
  @ApiOkResponse({ type: SecretResponseDto })
  async regenerateSecret(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('clientPk', ParseIntPipe) clientPk: number,
  ): Promise<SecretResponseDto> {
    const secret = await this.apps.regenerateClientSecret(user.userId, id, clientPk);
    return { secret };
  }

  @Get(':id/clients')
  @ApiOperation({ summary: '클라이언트 목록' })
  @ApiOkResponse({ type: [ClientDto] })
  async listClients(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientDto[]> {
    const clients = await this.apps.listClients(user.userId, id);
    return clients.map(toClient);
  }

  @Patch(':id/clients/:clientPk')
  @HttpCode(204)
  @ApiOperation({ summary: '클라이언트 수정(이름·origins·redirectUris)' })
  async updateClient(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('clientPk', ParseIntPipe) clientPk: number,
    @Body() dto: UpdateClientDto,
  ): Promise<void> {
    await this.apps.updateClient(user.userId, id, clientPk, dto);
  }

  @Delete(':id/clients/:clientPk')
  @HttpCode(204)
  @ApiOperation({ summary: '클라이언트 삭제' })
  async deleteClient(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('clientPk', ParseIntPipe) clientPk: number,
  ): Promise<void> {
    await this.apps.deleteClient(user.userId, id, clientPk);
  }
}

// ---- 매핑 ----

function toAppSummary(a: App): AppSummaryDto {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    reviewState: reviewStateOf(a),
    rejectionReason: a.rejectionReason ?? null,
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}

function toApiKeySummary(k: AppApiKey): ApiKeySummaryDto {
  return {
    id: k.id,
    name: k.name,
    status: k.status,
    keyPrefix: k.keyPrefix,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  };
}

function toClient(c: AppClient): ClientDto {
  return {
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    status: c.status,
    type: c.type,
    origins: (c.origins as string[] | null) ?? null,
    redirectUris: (c.redirectUris as string[] | null) ?? null,
    secretSuffix: c.secretSuffix ?? null,
    secretCreatedAt: c.secretCreatedAt ? c.secretCreatedAt.toISOString() : null,
    config: (c.config as Record<string, unknown> | null) ?? null,
    lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}
