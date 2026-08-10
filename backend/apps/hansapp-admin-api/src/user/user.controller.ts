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
import {
  UserAuthLogService,
  UserReadService,
} from '@hansapp/admin-application';

import {
  UserAuthLogDto,
  UserAuthLogQueryDto,
  UserDetailDto,
  UserListQueryDto,
  UserSummaryDto,
} from './dto/user.dto';

/**
 * 회원 조회. **읽기 전용이다** — 수정·탈퇴는 회원 본인의 통로(hansapp-api)가 한다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('admin-user')
@Controller('api/users')
export class UserController {
  constructor(
    private readonly users: UserReadService,
    private readonly logs: UserAuthLogService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '회원 목록',
    description: '최근 가입 순. 이메일·이름 부분 일치와 상태로 거를 수 있다.',
  })
  @ApiPageResponse(UserSummaryDto)
  async list(
    @Query() query: UserListQueryDto,
  ): Promise<PageResponseDto<UserSummaryDto>> {
    const page = await this.users.list(query);
    return new PageResponseDto(
      page,
      page.items.map((user) => new UserSummaryDto(user)),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '회원 상세' })
  @ApiOkResponse({ type: UserDetailDto })
  async detail(@Param('id', ParseIntPipe) id: number): Promise<UserDetailDto> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    return new UserDetailDto(user);
  }

  @Get(':id/auth-logs')
  @ApiOperation({
    summary: '회원 인증 기록',
    description:
      '로그인·로그아웃·가입·비밀번호 변경/재설정·소셜 연동/해제·탈퇴를 최근 순으로 돌려준다.\n\n' +
      '기본은 **전체 기간·전체 액션**이고, 기간(`from`·`to`)과 액션(`actions`)으로 좁힐 수 있다.',
  })
  @ApiPageResponse(UserAuthLogDto)
  async authLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: UserAuthLogQueryDto,
  ): Promise<PageResponseDto<UserAuthLogDto>> {
    /*
      **회원이 있는지 먼저 본다.** 로그는 별도 DB 라 없는 회원번호로 물어도 그냥 빈 목록이
      돌아온다 — 주소를 잘못 짚은 것과 "활동이 없는 회원" 이 화면에서 구별되지 않는다.
    */
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    const page = await this.logs.list({
      userId: id,
      page: query.page,
      size: query.size,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      actions: query.actions,
    });
    return new PageResponseDto(
      page,
      page.items.map((entry) => new UserAuthLogDto(entry)),
    );
  }
}
