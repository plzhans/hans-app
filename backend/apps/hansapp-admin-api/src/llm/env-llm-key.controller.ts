import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EnvLlmKeyAdminService } from '@hansapp/admin-application';
import { CurrentAdmin } from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import {
  EnvLlmKeyDto,
  EnvLlmKeySaveRequestDto,
  VendorModelsRequestDto,
  VendorModelsResponseDto,
} from './dto/env-llm-key.dto';

/**
 * 서버 LLM 키 관리.
 *
 * **설정(/api/settings)과 갈라 둔 이유**는 성격이 달라서다. 설정은 어떤 키가 있는지 코드가
 * 알고 값만 바뀌지만, 이쪽은 행이 늘고 준다 — LOCAL 은 여러 대를 붙일 수 있다.
 * 그래서 화면도 앱 클라이언트처럼 목록 + 상세 모달이다.
 */
@ApiTags('admin-llm')
@Controller('api/llm/keys')
export class EnvLlmKeyController {
  constructor(private readonly keys: EnvLlmKeyAdminService) {}

  @Get()
  @ApiOperation({ summary: '키 목록', description: '키는 뒤 4자만 내려간다.' })
  @ApiOkResponse({ type: [EnvLlmKeyDto] })
  async list(): Promise<EnvLlmKeyDto[]> {
    return (await this.keys.list()).map((v) => new EnvLlmKeyDto(v));
  }

  @Get(':id')
  @ApiOperation({ summary: '키 상세' })
  @ApiOkResponse({ type: EnvLlmKeyDto })
  async get(@Param('id', ParseIntPipe) id: number): Promise<EnvLlmKeyDto> {
    return new EnvLlmKeyDto(await this.keys.get(id));
  }

  @Post('models')
  @HttpCode(200)
  @ApiOperation({
    summary: '업체 모델 목록',
    description:
      '업체 API 를 직접 불러 실제로 있는 모델을 받아 온다. **화면을 돕는 수단이다** — ' +
      '실패해도 사람이 모델 이름을 직접 적을 수 있어야 하므로 등록을 막지 않는다.',
  })
  @ApiOkResponse({ type: VendorModelsResponseDto })
  async models(
    @Body() dto: VendorModelsRequestDto,
  ): Promise<VendorModelsResponseDto> {
    return new VendorModelsResponseDto(await this.keys.listVendorModels(dto));
  }

  @Post()
  @ApiOperation({ summary: '키 등록' })
  @ApiOkResponse({ type: EnvLlmKeyDto })
  async create(
    @Body() dto: EnvLlmKeySaveRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<EnvLlmKeyDto> {
    return new EnvLlmKeyDto(await this.keys.create(dto, admin.adminId));
  }

  @Put(':id')
  @ApiOperation({
    summary: '키 수정',
    description: '보내지 않은 필드는 건드리지 않는다.',
  })
  @ApiOkResponse({ type: EnvLlmKeyDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnvLlmKeySaveRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<EnvLlmKeyDto> {
    return new EnvLlmKeyDto(await this.keys.update(id, dto, admin.adminId));
  }

  @Post(':id/default')
  @HttpCode(204)
  @ApiOperation({
    summary: '기본 키로 지정',
    description: '지정 없는 호출이 이 키로 나간다. 전체에서 하나만 기본이다.',
  })
  @ApiNoContentResponse()
  async setDefault(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<void> {
    await this.keys.setDefault(id, admin.adminId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '키 삭제',
    description:
      '기본으로 지정된 것은 못 지운다 — 먼저 다른 것을 기본으로 옮긴다.',
  })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.keys.remove(id);
  }
}
