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
import { UserReadService } from '@hansapp/admin-application';

import {
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
  constructor(private readonly users: UserReadService) {}

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
}
