import { Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import { LlmUsageLogService } from '@hansapp/admin-application';

import { LlmUsageLogDto, LlmUsageLogQueryDto } from './dto/llm-usage-log.dto';

/**
 * 전역 로그 조회.
 *
 * **대상에 딸린 로그와 자리를 나눈다.** 회원 한 명의 인증 기록은 그 회원 아래
 * (`/api/users/:id/auth-logs`)에 있다 — 회원을 특정하고 들어가는 조회라 거기가 맞다.
 * 여기 `/api/logs/*` 는 반대로 **대상을 가리지 않고 기간으로 훑는** 조회들의 자리다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('logs')
@ApiController('api/logs')
export class LlmUsageLogController {
  constructor(private readonly logs: LlmUsageLogService) {}

  @Get('llm')
  @ApiOperation({
    summary: 'LLM 호출 이력',
    description:
      'LLM 호출을 최근 순으로 돌려준다. 기간·기능·캐시 여부로 거르고, `requestId` 로 한 건을 바로 찾는다.\n\n' +
      '**합산은 하지 않는다** — 사용량·정산은 별도로 기록한다. 이 표는 이력이다.\n\n' +
      '`from` 또는 `requestId` 중 하나는 반드시 있어야 한다(없으면 400). ' +
      '인덱스가 시각 기준이라 기간 없는 조회는 표를 통째로 훑기 때문이다.',
  })
  @ApiPageResponse(LlmUsageLogDto)
  async llm(@Query() query: LlmUsageLogQueryDto): Promise<PageResponseDto<LlmUsageLogDto>> {
    const page = await this.logs.list({
      page: query.page,
      size: query.size,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      requestId: query.requestId,
      feature: query.feature,
      cached: query.cached,
      appId: query.appId,
      userId: query.userId,
    });
    return PageResponseDto.from(page.map((entry) => new LlmUsageLogDto(entry)));
  }
}
