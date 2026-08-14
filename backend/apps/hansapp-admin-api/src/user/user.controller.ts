import {
  Body,
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
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import {
  AppReadService,
  UserAdminService,
  UserProfileCacheAdmin,
  UserSessionCacheAdmin,
  UserAuthLogService,
  UserReadService,
  UserSessionAdminService,
} from '@hansapp/admin-application';

import {
  UserAppDto,
  UserAuthLogDto,
  UserAuthLogQueryDto,
  UserDetailDto,
  UserListQueryDto,
  OrphanSessionCacheDto,
  CacheStateDto,
  UserSessionDto,
  UserSessionListDto,
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
@ApiTags('users')
@ApiController('api/users')
export class UserController {
  constructor(
    private readonly users: UserReadService,
    private readonly userAdmin: UserAdminService,
    private readonly profileCache: UserProfileCacheAdmin,
    private readonly sessionAdmin: UserSessionAdminService,
    private readonly sessionCache: UserSessionCacheAdmin,
    private readonly logs: UserAuthLogService,
    /*
      **앱은 회원의 소유물이 아니라 별개 도메인이다.** 그래도 "이 회원이 무슨 앱을
      들고 있나" 는 회원을 볼 때 묻는 것이라, 조회는 앱 쪽 서비스를 그대로 빌려 온다 —
      회원 저장소에 앱 쿼리를 하나 더 만들면 같은 표를 두 곳에서 읽게 된다.
    */
    private readonly apps: AppReadService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '회원 목록',
    description: '최근 가입 순. 이메일·이름 부분 일치와 상태로 거를 수 있다.',
  })
  @ApiPageResponse(UserSummaryDto)
  async list(@Query() query: UserListQueryDto): Promise<PageResponseDto<UserSummaryDto>> {
    const page = await this.users.list(query);
    return PageResponseDto.from(page.map((user) => new UserSummaryDto(user)));
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
      '표시 이름·등급·언어·시간대를 바꾼다. 보낸 항목만 바뀐다.\n\n' +
      '이메일과 이메일 인증 여부는 이 통로로 고칠 수 없다 — ' +
      '이메일은 로그인 식별자이고, 인증 여부는 우리가 확인했다는 기록이다.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<void> {
    // 없는 회원이면 서비스가 404 를 던진다(고칠 행이 없다는 것으로 판단한다).
    await this.userAdmin.update(id, {
      name: dto.name,
      tier: dto.tier,
      language: dto.language,
      timeZone: dto.timeZone,
    });
  }

  @Get(':id/apps')
  @ApiOperation({
    summary: '회원이 소유·참여하는 앱',
    description:
      '이 회원이 멤버로 들어 있는 앱을 최근 등록 순으로 돌려준다. 역할(OWNER·ADMIN·MEMBER)과 ' +
      '합류 시각을 함께 준다.\n\n' +
      '**삭제된 앱도 포함한다.** 회원 상세의 앱 수와 줄 수가 어긋나지 않게 하려는 것이다 — ' +
      '지워진 앱인지는 `deletedAt` 으로 가른다.',
  })
  @ApiOkResponse({ type: [UserAppDto] })
  async listApps(@Param('id', ParseIntPipe) id: number): Promise<UserAppDto[]> {
    // 없는 회원도 빈 목록이 나온다. 주소를 잘못 짚은 것과 구별되게 먼저 확인한다.
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    const apps = await this.apps.listByUser(id);
    return apps.map((app) => new UserAppDto(app));
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
  @ApiOkResponse({ type: CacheStateDto })
  async cacheState(@Param('id', ParseIntPipe) id: number): Promise<CacheStateDto> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    return new CacheStateDto(await this.profileCache.inspect(id));
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
    description: '살아 있는 로그인 세션을 최근 활동 순으로 돌려준다. 만료된 세션은 빠진다.',
  })
  @ApiOkResponse({ type: UserSessionListDto })
  async sessions(@Param('id', ParseIntPipe) id: number): Promise<UserSessionListDto> {
    // 없는 회원도 빈 목록이 나온다. 주소를 잘못 짚은 것과 구별되게 먼저 확인한다.
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    /*
      **DB 와 캐시를 따로 읽어 합친다.** 목록의 정본은 DB 지만 요청을 실제로 통과시키는
      것은 캐시라, 어긋나는 쪽을 감추면 "끊었는데 왜 아직 되지" 를 짚을 수 없다.
    */
    const [rows, cached] = await Promise.all([
      this.users.listSessions(id),
      this.sessionCache.listByUser(id),
    ]);

    const caches = await this.sessionCache.inspectMany(
      id,
      rows.map((row) => row.sessionId),
    );
    const sessions = rows.map((row, index) => new UserSessionDto(row, caches[index]));

    // DB 에 없는데 캐시에만 있는 것 = 폐기 때 캐시 삭제가 새어 남은 것.
    const live = new Set(rows.map((row) => row.sessionId));
    const orphans = cached
      .filter((entry) => !live.has(entry.sessionId))
      .map((entry) => new OrphanSessionCacheDto(entry));

    return new UserSessionListDto(sessions, orphans);
  }

  @Get(':id/sessions/:sessionId/cache')
  @ApiOperation({
    summary: '세션 캐시 상태',
    description:
      '이 세션의 인증 캐시에 담긴 값을 그대로 돌려준다. 무엇이 들어 있어서 통과하는지를 ' +
      '눈으로 확인하는 통로다.\n\n' +
      'DB 행이 없는 세션(고아 캐시)도 조회된다 — 오히려 그때 들여다볼 일이 많다.',
  })
  @ApiOkResponse({ type: CacheStateDto })
  async sessionCacheState(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<CacheStateDto> {
    await this.assertOwnSession(id, sessionId);
    return new CacheStateDto(await this.sessionCache.inspect(id, sessionId));
  }

  @Post(':id/sessions/:sessionId/cache/purge')
  @HttpCode(204)
  @ApiOperation({
    summary: '세션 캐시 초기화',
    description:
      '이 세션의 인증 캐시(공유 캐시)를 지운다. 다음 요청이 DB 를 다시 읽는다.\n\n' +
      '**세션을 끊는 것이 아니다.** 세션 행은 그대로라 살아 있으면 그대로 통과한다 — ' +
      '기기를 끊으려면 로그아웃 쪽을 쓴다.\n\n' +
      'API 인스턴스가 앞에 둔 메모리 캐시는 지우지 못한다(TTL 로 스스로 빠진다).',
  })
  async purgeSessionCache(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<void> {
    /*
      **이 회원의 세션이 맞는지 확인한다.** 캐시 키는 sid 하나로 열리므로, 확인 없이 받으면
      남의 세션 캐시를 지울 수 있다. 지우는 것이 폐기는 아니지만 남의 것을 건드릴 이유가 없다.
    */
    await this.assertOwnSession(id, sessionId);
    await this.sessionCache.purge(id, sessionId);
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
  async revokeAllSessions(@Param('id', ParseIntPipe) id: number): Promise<void> {
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
    @Param('sessionId', ParseIntPipe) sessionId: number,
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
    return PageResponseDto.from(page.map((entry) => new UserAuthLogDto(entry)));
  }

  /**
   * 이 세션이 그 회원의 것인지 확인한다.
   *
   * **DB 행이 없어도 통과시킨다.** 캐시를 다루는 통로들은 고아 캐시(행은 없고 캐시만 남은
   * 것)를 대상으로 삼기 때문이다 — 행이 있어야만 손댈 수 있게 하면 정작 손대야 할 것을
   * 못 건드린다. 대신 남의 것을 건드리지 않도록 회원 소속만은 반드시 본다.
   */
  private async assertOwnSession(userId: number, sessionId: number): Promise<void> {
    const [rows, cached] = await Promise.all([
      this.users.listSessions(userId),
      this.sessionCache.listByUser(userId),
    ]);
    const mine =
      rows.some((row) => row.sessionId === sessionId) ||
      cached.some((entry) => entry.sessionId === sessionId);
    if (!mine) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
  }
}
