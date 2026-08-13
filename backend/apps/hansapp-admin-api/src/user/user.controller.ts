import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import {
  UserAdminService,
  UserProfileCacheAdmin,
  UserAuthLogService,
  UserReadService,
  UserSessionAdminService,
} from '@hansapp/admin-application';

import {
  UserAuthLogDto,
  UserAuthLogQueryDto,
  UserDetailDto,
  UserListQueryDto,
  ProfileCacheStateDto,
  UserSessionDto,
  UserSummaryDto,
  UpdateUserRequestDto,
} from './dto/user.dto';

/**
 * 회원 조회. **거의 읽기 전용이다** — 수정·탈퇴는 회원 본인의 통로(hansapp-api)가 한다.
 *
 * 예외는 둘이다. **로그인 세션 폐기**(도용이 의심될 때 본인보다 먼저 끊어야 하는 경우가
 * 있다)와 **표시 이름 수정**이다. 이메일·인증 여부·등급은 열지 않았다 — 무엇을 왜 안 열었는지는
 * UserAdminService 주석에 적어 두었다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('admin-user')
@Controller('api/users')
export class UserController {
  constructor(
    private readonly users: UserReadService,
    private readonly userAdmin: UserAdminService,
    private readonly profileCache: UserProfileCacheAdmin,
    private readonly sessionAdmin: UserSessionAdminService,
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

  @Patch(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '회원 정보 수정',
    description:
      '표시 이름을 바꾼다. 보낸 항목만 바뀐다.\n\n' +
      '이메일·이메일 인증 여부·등급은 이 통로로 고칠 수 없다 — ' +
      '이메일은 로그인 식별자이고, 인증 여부는 우리가 확인했다는 기록이며, ' +
      '등급은 앱 생성 한도를 바꾸는 값이라 따로 설계할 일이다.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<void> {
    // 없는 회원이면 서비스가 404 를 던진다(고칠 행이 없다는 것으로 판단한다).
    await this.userAdmin.update(id, { name: dto.name });
  }

  @Get(':id/cache')
  @ApiOperation({
    summary: '내 정보 캐시 상태',
    description:
      '이 회원의 `/users/me` 응답이 공유 캐시(Redis)에 올라가 있는지와 만료까지 남은 시간을 돌려준다.\n\n' +
      '**API 인스턴스의 메모리 캐시는 보이지 않는다.** 캐시는 2단(프로세스 메모리 → Redis)인데 ' +
      '메모리 단은 인스턴스마다 따로 있어 밖에서 셀 수 없다 — 여기서 "없음" 이어도 어느 ' +
      '인스턴스는 최대 60초까지 들고 있을 수 있다.',
  })
  @ApiOkResponse({ type: ProfileCacheStateDto })
  async cacheState(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProfileCacheStateDto> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    return new ProfileCacheStateDto(await this.profileCache.inspect(id));
  }

  @Post(':id/cache/purge')
  @HttpCode(204)
  @ApiOperation({
    summary: '내 정보 캐시 초기화',
    description:
      '공유 캐시(Redis)를 지우고, 각 API 인스턴스가 자기 메모리 캐시를 비우도록 알린다.\n\n' +
      '정보를 고칠 때 이미 지우지만, 반영이 안 된 것 같을 때 쓰는 통로다.',
  })
  async purgeCache(@Param('id', ParseIntPipe) id: number): Promise<void> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    await this.profileCache.purge(id);
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: '회원의 로그인 기기',
    description:
      '살아 있는 로그인 세션을 최근 활동 순으로 돌려준다. 만료된 세션은 빠진다.',
  })
  @ApiOkResponse({ type: [UserSessionDto] })
  async sessions(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserSessionDto[]> {
    // 없는 회원도 빈 목록이 나온다. 주소를 잘못 짚은 것과 구별되게 먼저 확인한다.
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    const rows = await this.users.listSessions(id);
    return rows.map((row) => new UserSessionDto(row));
  }

  @Delete(':id/sessions')
  @HttpCode(204)
  @ApiOperation({
    summary: '회원의 모든 기기 로그아웃',
    description:
      '이 회원의 로그인 세션을 전부 폐기한다. 만료된 세션까지 함께 지운다.\n\n' +
      '**즉시 막히지는 않는다.** access token 은 서명만으로 검증되는 JWT 라, ' +
      '세션 캐시가 갱신되기까지(기본 60초) 발급돼 있던 토큰이 통한다.',
  })
  async revokeAllSessions(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    await this.sessionAdmin.revokeAll(id);
  }

  @Delete(':id/sessions/:sessionId')
  @HttpCode(204)
  @ApiOperation({
    summary: '회원의 기기 한 대 로그아웃',
    description:
      '세션 하나를 폐기한다. 그 회원의 세션이 아니면 404 다.\n\n' +
      '반영 시점은 전체 로그아웃과 같다.',
  })
  async revokeSession(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    /*
      **회원을 먼저 확인하지 않는다.** 폐기가 userId 를 조건에 함께 넣어 지우므로,
      없는 회원이든 남의 세션이든 결과가 "지운 것 없음" 으로 같다 — 조회를 한 번 더
      해 봐야 답이 달라지지 않는다.
    */
    const removed = await this.sessionAdmin.revokeOne(id, sessionId);
    if (removed.length === 0) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
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
