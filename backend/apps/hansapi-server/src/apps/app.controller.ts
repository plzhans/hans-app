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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AppService,
  Auth,
  AuthType,
  CurrentUser,
} from '@hansapi/auth-application';
import type {
  App,
  AppApiKey,
  AppClient,
  AuthUser,
} from '@hansapi/auth-application';

import {
  ApiKeySummaryDto,
  AppDetailDto,
  AppSummaryDto,
  ClientDto,
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
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAppDto,
  ): Promise<AppSummaryDto> {
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
    return {
      id: app.id,
      name: app.name,
      createdBy: app.createdBy,
      createdAt: app.createdAt.toISOString(),
      apiKeys: app.apiKeys.map(toApiKeySummary),
      clients: app.clients.map(toClient),
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: '앱 이름 변경' })
  @ApiOkResponse({ type: AppSummaryDto })
  async rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppDto,
  ): Promise<AppSummaryDto> {
    return toAppSummary(await this.apps.renameApp(user.userId, id, dto.name));
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
  @HttpCode(200)
  @ApiOperation({
    summary: '서비스 키 발급/재발급',
    description:
      '앱당 1개라 기존 키가 있으면 교체(재발급)한다. 원문(sk_...)은 이 응답에서만 확인 가능하다.',
  })
  @ApiOkResponse({ type: CreatedApiKeyDto })
  async issueApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CreatedApiKeyDto> {
    const { apiKey, plainKey } = await this.apps.issueApiKey(user.userId, id);
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
    return (await this.apps.listApiKeys(user.userId, id)).map(toApiKeySummary);
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
    summary: '클라이언트 등록(앱당 1개)',
    description: 'client secret 원문(cs_...)은 이 응답에서만 확인 가능하다.',
  })
  @ApiCreatedResponse({ type: CreatedClientDto })
  async createClient(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClientDto,
  ): Promise<CreatedClientDto> {
    const { client, plainSecret } = await this.apps.createClient(
      user.userId,
      id,
      { name: dto.name, origins: dto.origins, redirectUris: dto.redirectUris },
    );
    return { ...toClient(client), secret: plainSecret };
  }

  @Post(':id/clients/:clientPk/secret')
  @HttpCode(200)
  @ApiOperation({
    summary: '클라이언트 보안 비밀번호 재발급',
    description:
      '기존 시크릿은 즉시 무효화된다. 새 원문은 이 응답에서만 확인 가능하다.',
  })
  @ApiOkResponse({ type: SecretResponseDto })
  async regenerateSecret(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('clientPk', ParseIntPipe) clientPk: number,
  ): Promise<SecretResponseDto> {
    const secret = await this.apps.regenerateClientSecret(
      user.userId,
      id,
      clientPk,
    );
    return { secret };
  }

  @Get(':id/clients')
  @ApiOperation({ summary: '클라이언트 목록' })
  @ApiOkResponse({ type: [ClientDto] })
  async listClients(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientDto[]> {
    return (await this.apps.listClients(user.userId, id)).map(toClient);
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
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}

function toApiKeySummary(k: AppApiKey): ApiKeySummaryDto {
  return {
    id: k.id,
    name: k.name,
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
    origins: (c.origins as string[] | null) ?? [],
    redirectUris: (c.redirectUris as string[] | null) ?? [],
    secretSuffix: c.secretSuffix,
    secretCreatedAt: c.secretCreatedAt.toISOString(),
    lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}
