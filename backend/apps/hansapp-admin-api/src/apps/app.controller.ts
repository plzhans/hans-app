import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { AppReadService } from '@hansapp/admin-application';

import { AppDetailDto, AppListQueryDto, AppSummaryDto } from './dto/app.dto';

/**
 * 앱(개발자 플랫폼) 조회. **읽기 전용이다** — 승인·차단은 별도 기능으로 뺀다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('admin-app')
@Controller('api/apps')
export class AppController {
  constructor(private readonly apps: AppReadService) {}

  @Get()
  @ApiOperation({
    summary: '앱 목록',
    description:
      '최근 등록 순. 앱 이름·소유자 이메일 부분 일치와 상태로 거를 수 있다. ' +
      '삭제된 앱은 기본으로 제외한다.',
  })
  @ApiPageResponse(AppSummaryDto)
  async list(
    @Query() query: AppListQueryDto,
  ): Promise<PageResponseDto<AppSummaryDto>> {
    const page = await this.apps.list(query);
    return new PageResponseDto(
      page,
      page.items.map((app) => new AppSummaryDto(app)),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: '앱 상세',
    description: '멤버·서비스 키·OAuth 클라이언트를 함께 준다.',
  })
  @ApiOkResponse({ type: AppDetailDto })
  async detail(@Param('id', ParseIntPipe) id: number): Promise<AppDetailDto> {
    const app = await this.apps.findById(id);
    if (!app) {
      throw new NotFoundException(`App not found: ${id}`);
    }
    return new AppDetailDto(app);
  }
}
