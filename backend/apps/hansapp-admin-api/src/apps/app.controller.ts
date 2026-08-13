import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { AppModerationService, AppReadService } from '@hansapp/admin-application';
import { CurrentAdmin } from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import { AppDetailDto, AppListQueryDto, AppRejectRequestDto, AppSummaryDto } from './dto/app.dto';

/**
 * 앱(개발자 플랫폼) 조회와 관리 조치(승인·거절·차단).
 *
 * **쓰기는 관리 조치뿐이다.** 이름·키·클라이언트 수정은 소유자의 통로(hansapp-api)가
 * 하고 여기서는 손대지 않는다 — 열어 두면 "관리자니까 다 된다" 가 기본값이 된다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('admin-app')
@Controller('api/apps')
export class AppController {
  constructor(
    private readonly apps: AppReadService,
    private readonly moderation: AppModerationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '앱 목록',
    description:
      '최근 등록 순. 앱 이름·소유자 이메일 부분 일치와 상태로 거를 수 있다. ' +
      '삭제된 앱은 기본으로 제외한다.',
  })
  @ApiPageResponse(AppSummaryDto)
  async list(@Query() query: AppListQueryDto): Promise<PageResponseDto<AppSummaryDto>> {
    const page = await this.apps.list(query);
    return PageResponseDto.from(page.map((app) => new AppSummaryDto(app)));
  }

  @Get(':id')
  @ApiOperation({
    summary: '앱 상세',
    description: '멤버·서비스 키·OAuth 클라이언트를 함께 준다.',
  })
  @ApiOkResponse({ type: AppDetailDto })
  async detail(@Param('id', ParseIntPipe) id: number): Promise<AppDetailDto> {
    return this.detailOf(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: '앱 승인',
    description:
      '앱을 승인하고 미승인 상태의 서비스 키·OAuth 클라이언트를 함께 활성화한다. ' +
      '사용자가 꺼 둔 것은 그대로 둔다. 이미 승인된 앱에 다시 호출해도 성공한다.',
  })
  @ApiOkResponse({ type: AppDetailDto })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<AppDetailDto> {
    await this.moderation.approve(id, admin.adminId);
    return this.detailOf(id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: '앱 심사 거절',
    description:
      '거절 사유를 남긴다. 앱은 미승인 상태로 남고, 소유자가 고쳐 다시 심사를 요청할 수 있다.',
  })
  @ApiOkResponse({ type: AppDetailDto })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AppRejectRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<AppDetailDto> {
    await this.moderation.reject(id, dto.reason, admin.adminId);
    return this.detailOf(id);
  }

  @Post(':id/block')
  @HttpCode(200)
  @ApiOperation({
    summary: '앱 차단',
    description:
      '앱과 그에 속한 서비스 키·OAuth 클라이언트를 모두 중지한다. 이 앱의 API 호출은 즉시 거부된다. ' +
      '삭제가 아니며 차단 해제로 되돌릴 수 있다. 이미 중지된 앱에 다시 호출해도 성공한다.',
  })
  @ApiOkResponse({ type: AppDetailDto })
  async block(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<AppDetailDto> {
    await this.moderation.block(id, admin.adminId);
    return this.detailOf(id);
  }

  @Post(':id/unblock')
  @HttpCode(200)
  @ApiOperation({
    summary: '앱 차단 해제',
    description:
      '차단된 앱과 그에 속한 서비스 키·OAuth 클라이언트를 다시 활성화한다. 중지 상태인 앱만 호출할 수 있다.',
  })
  @ApiOkResponse({ type: AppDetailDto })
  async unblock(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() admin: AdminAuthUser,
  ): Promise<AppDetailDto> {
    await this.moderation.unblock(id, admin.adminId);
    return this.detailOf(id);
  }

  /**
   * 상세를 읽어 DTO 로 만든다. 심사 뒤에도 이걸 돌려준다 — 화면이 바뀐 상태를 다시
   * 물어보지 않아도 되고, 승인으로 함께 켜진 키·클라이언트까지 한 번에 반영된다.
   */
  private async detailOf(id: number): Promise<AppDetailDto> {
    const app = await this.apps.findById(id);
    if (!app) {
      throw new NotFoundException(`App not found: ${id}`);
    }
    return new AppDetailDto(app);
  }
}
