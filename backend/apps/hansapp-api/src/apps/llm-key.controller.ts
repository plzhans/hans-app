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
import {
  Auth,
  AuthType,
  CurrentUser,
  LlmKeyService,
} from '@hansapp/auth-application';
import type { AuthUser, LlmKeyView } from '@hansapp/auth-application';

import { CreateLlmKeyDto, LlmKeyDto, UpdateLlmKeyDto } from './dto/llm-key.dto';

/**
 * 앱이 자기 이름으로 쓸 LLM 업체 키(BYOK) 관리. 앱 상세 화면의 AI/LLM 탭이 부른다.
 *
 * **스펙에 싣지 않는다(@ApiExcludeController).** AppsController 와 같은 이유다 — 여기는
 * 우리 개발자 콘솔이 부르는 자리이고, 연동하는 쪽이 업체 키를 넣는 것은 화면에서 할 일이다.
 *
 * **키 원문은 어느 응답에도 실리지 않는다.** 저장 직후에도 다시 보여주지 않고 뒤 4자만 남는다 —
 * 다시 볼 수 있게 두면 "화면에서만 가리면 된다" 로 흘러가고, 그 순간 응답 JSON 에는 남는다.
 * */
@ApiExcludeController()
@ApiTags('apps')
@Auth(AuthType.Jwt)
@Controller('apps/:appId/llm-keys')
export class LlmKeyController {
  constructor(private readonly keys: LlmKeyService) {}

  @Get()
  @ApiOperation({ summary: '업체 키 목록' })
  @ApiOkResponse({ type: [LlmKeyDto] })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('appId', ParseIntPipe) appId: number,
  ): Promise<LlmKeyDto[]> {
    const keys = await this.keys.list(user.userId, appId);
    return keys.map(toLlmKey);
  }

  @Post()
  @ApiOperation({
    summary: '업체 키 등록',
    description:
      'OpenAI·Anthropic·Google 은 앱당 하나뿐이라 이미 있으면 교체된다(상한·모델 설정은 유지). ' +
      'LOCAL 은 이름이 다르면 여러 개 등록할 수 있다.',
  })
  @ApiCreatedResponse({ type: LlmKeyDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: CreateLlmKeyDto,
  ): Promise<LlmKeyDto> {
    return toLlmKey(await this.keys.create(user.userId, appId, dto));
  }

  @Patch(':id')
  @ApiOperation({
    summary: '업체 키 수정',
    description: '보내지 않은 항목은 그대로 둔다. 키를 보내면 교체된다.',
  })
  @ApiOkResponse({ type: LlmKeyDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLlmKeyDto,
  ): Promise<LlmKeyDto> {
    return toLlmKey(await this.keys.update(user.userId, appId, id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '업체 키 삭제' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('appId', ParseIntPipe) appId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.keys.remove(user.userId, appId, id);
  }
}

/** 저장 형태 → 응답. 잠긴 값은 프로젝션 단계에서 이미 빠져 있어 여기서 지울 것이 없다. */
function toLlmKey(key: LlmKeyView): LlmKeyDto {
  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    secretSuffix: key.secretSuffix,
    baseUrl: key.baseUrl,
    defaultModel: key.defaultModel,
    monthlyLimitMicroUsd: key.monthlyLimitMicroUsd,
    dailyLimitMicroUsd: key.dailyLimitMicroUsd,
    fallbackToService: key.fallbackToService,
    verifyState: key.verifyState,
    verifiedAt: key.verifiedAt ? key.verifiedAt.toISOString() : null,
    verifyError: key.verifyError,
    enabled: key.enabled,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
  };
}
