import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { AuthLogService } from '@hansapp/admin-application';

import { AuthLogDto, AuthLogQueryDto } from './dto/auth-log.dto';

/**
 * 전역 인증 기록. `/api/logs` 아래의 두 번째 조회다(LlmUsageLogController 주석 참고).
 *
 * **회원 상세의 탭과 겹치지 않는다.** 거기는 회원을 특정하고 들어가는 조회고, 여기는
 * 대상을 안 가리고 기간으로 훑는다. 특히 `anonymousOnly` 로 보는 행(없는 계정으로의
 * 로그인 시도)은 어느 회원에도 안 붙어 회원 상세에서는 영영 안 보인다.
 */
@ApiTags('admin-log')
@Controller('api/logs')
export class AuthLogController {
  constructor(private readonly logs: AuthLogService) {}

  @Get('auth')
  @ApiOperation({
    summary: '전역 인증 기록',
    description:
      '로그인·로그아웃·가입·비밀번호 변경/재설정·소셜 연동/해제·탈퇴를 최근 순으로 돌려준다.\n\n' +
      '기간·액션·결과·IP·회원으로 거른다. 회원은 번호(`userId`)나 이메일(`userEmail`) 중 하나로 지정한다.\n\n' +
      '`from` 은 **필수다** — 대상을 안 가리는 조회라 기간이 없으면 표를 통째로 읽는다.',
  })
  @ApiPageResponse(AuthLogDto)
  async auth(
    @Query() query: AuthLogQueryDto,
  ): Promise<PageResponseDto<AuthLogDto>> {
    const page = await this.logs.list({
      page: query.page,
      size: query.size,
      from: new Date(query.from),
      to: query.to ? new Date(query.to) : undefined,
      actions: query.actions,
      result: query.result,
      ip: query.ip,
      userId: query.userId,
      userEmail: query.userEmail,
      anonymousOnly: query.anonymousOnly,
    });
    return PageResponseDto.from(page.map((entry) => new AuthLogDto(entry)));
  }
}
