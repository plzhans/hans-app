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
import { EnvLlmModelAdminService } from '@hansapp/admin-application';
import { CurrentAdmin } from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import {
  EnvLlmModelCreateRequestDto,
  EnvLlmModelDto,
  EnvLlmModelReorderRequestDto,
  EnvLlmModelUpdateRequestDto,
} from './dto/env-llm-model.dto';

/**
 * 서버가 부를 수 있는 모델 목록.
 *
 * **키 밑에 딸린다**(`/api/llm/keys/:id` 의 형제가 아니라 별도 목록인 것은, 화면이 키 목록
 * 아래에 모델 목록을 나란히 두기 때문이다). 어느 키의 것인지는 `keyId` 로 간다.
 *
 * 업체에 실제로 있는 모델을 물어보는 것은 `/api/llm/keys/models` 다 — 그쪽은 잠긴 값을
 * 열어야 해서 키 쪽에 있다.
 */
@ApiTags('admin-llm')
@Controller('api/llm/models')
export class EnvLlmModelController {
  constructor(private readonly models: EnvLlmModelAdminService) {}

  @Get()
  @ApiOperation({
    summary: '모델 목록',
    description: '전부 내려간다. 화면이 keyId 로 묶는다.',
  })
  @ApiOkResponse({ type: [EnvLlmModelDto] })
  async list(): Promise<EnvLlmModelDto[]> {
    const models = await this.models.list();
    return models.map((model) => new EnvLlmModelDto(model));
  }

  @Post()
  @ApiOperation({
    summary: '모델 등록',
    description: '그 키의 첫 모델이면 자동으로 기본이 된다.',
  })
  @ApiOkResponse({ type: EnvLlmModelDto })
  async create(
    @Body() dto: EnvLlmModelCreateRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<EnvLlmModelDto> {
    return new EnvLlmModelDto(await this.models.create(dto, admin.adminId));
  }

  @Put('order')
  @ApiOperation({
    summary: '모델 차례 변경',
    description:
      '**화면에 내려보내는 순서가 이 차례다.** 그 키의 모델 id 를 빠짐없이 나열해 보낸다.',
  })
  @ApiOkResponse({ type: [EnvLlmModelDto] })
  async reorder(
    @Body() dto: EnvLlmModelReorderRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<EnvLlmModelDto[]> {
    const rows = await this.models.reorder(dto.keyId, dto.ids, admin.adminId);
    return rows.map((v) => new EnvLlmModelDto(v));
  }

  /*
    **`:id` 보다 뒤에 두면 안 된다.** Nest 는 선언 순서로 라우트를 고르므로 `PUT /order` 가
    `PUT /:id` 에 먼저 걸려 'order' 를 id 로 파싱하다 400 이 난다.
  */
  @Put(':id')
  @ApiOperation({
    summary: '모델 수정',
    description: '사용 여부를 여기서 켜고 끈다. 보내지 않은 필드는 그대로.',
  })
  @ApiOkResponse({ type: EnvLlmModelDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnvLlmModelUpdateRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<EnvLlmModelDto> {
    return new EnvLlmModelDto(await this.models.update(id, dto, admin.adminId));
  }

  @Post(':id/default')
  @HttpCode(204)
  @ApiOperation({
    summary: '기본 모델로 지정',
    description:
      '모델을 안 적은 요청이 이 모델로 나간다. 같은 키 안에서 하나만 기본이고, 꺼져 있었다면 같이 켜진다.',
  })
  @ApiNoContentResponse()
  async setDefault(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<void> {
    await this.models.setDefault(id, admin.adminId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '모델 삭제',
    description:
      '기본으로 지정된 것은 못 지운다(그 키의 마지막 하나라면 지울 수 있다).',
  })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.models.remove(id);
  }
}
