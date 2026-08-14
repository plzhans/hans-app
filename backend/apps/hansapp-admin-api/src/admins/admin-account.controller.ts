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
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import { AdminActionLogReadService, AdminEmailService } from '@hansapp/admin-application';
import {
  AdminAccountService,
  AdminProfileCache,
  AdminSessionCache,
  CurrentAdmin,
} from '@hansapp/admin-application/auth';
import type { AdminActor, AdminAuthUser } from '@hansapp/admin-application/auth';

import { requestMeta } from '../auth/admin-cookie';
import {
  AdminAccountCreateRequestDto,
  AdminAccountCreateResponseDto,
  AdminAccountDetailDto,
  AdminAccountSummaryDto,
  AdminAccountUpdateRequestDto,
  AdminActionLogDto,
  AdminActionLogQueryDto,
  AdminCacheStateDto,
  AdminListQueryDto,
  AdminPasswordResetRequestDto,
  AdminPasswordResetResponseDto,
  AdminSessionDto,
  AdminSessionListDto,
  OrphanAdminSessionCacheDto,
} from './dto/admin-account.dto';

/**
 * 관리자 계정 관리.
 *
 * **등급이 정하는 것은 "누구를 건드릴 수 있나" 뿐이다.** 관리자는 누구나 계정을 더할 수
 * 있지만 자기보다 높은 등급은 만들지도 고치지도(지우지도, 비밀번호를 다시 내지도) 못한다.
 * 어느 화면을 어느 등급까지 열지는 아직 정하지 않았다 — 설정·회원·앱은 등급을 보지 않는다.
 *
 * 본인 계정을 보는 것은 여기가 아니라 `/auth/me` 다 — 그쪽은 비밀번호를 바꿔야 하는
 * 상태에서도 열려 있어야 하고, 이 경로는 그 상태에서 막힌다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 */
@ApiTags('admins')
@ApiController('api/admins')
export class AdminAccountController {
  constructor(
    private readonly accounts: AdminAccountService,
    private readonly sessionCache: AdminSessionCache,
    private readonly profileCache: AdminProfileCache,
    private readonly mail: AdminEmailService,
    private readonly logs: AdminActionLogReadService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '관리자 목록',
    description:
      '번호 순. **페이징이 없다** — 계정 수가 적어 나눌 것이 없다.\n\n' +
      '기본은 **살아 있는 계정만**이다. `deleted=true` 를 주면 지운 계정만 돌려준다' +
      '(지운 시각 최근 순) — 두 목록은 섞이지 않는다.',
  })
  @ApiOkResponse({ type: [AdminAccountSummaryDto] })
  async list(@Query() query: AdminListQueryDto): Promise<AdminAccountSummaryDto[]> {
    const admins = await this.accounts.list(query.deleted);
    return admins.map((admin) => new AdminAccountSummaryDto(admin));
  }

  @Get(':id')
  @ApiOperation({ summary: '관리자 상세' })
  @ApiOkResponse({ type: AdminAccountDetailDto })
  async detail(@Param('id', ParseIntPipe) id: number): Promise<AdminAccountDetailDto> {
    const admin = await this.accounts.findById(id);
    if (!admin) {
      throw new NotFoundException(`Admin not found: ${id}`);
    }
    return new AdminAccountDetailDto(admin);
  }

  @Post()
  @ApiOperation({
    summary: '관리자 추가',
    description:
      '계정을 만든다. **본인이 첫 로그인에서 비밀번호를 다시 바꿔야** 다른 API 를 부를 수 있다.\n\n' +
      '**자기보다 높은 등급은 만들 수 없다**(403).\n\n' +
      '`sendEmail` 을 주면 만든 계정에 이메일·임시 비밀번호를 메일로 알린다. ' +
      '**발송 실패는 계정 생성을 되돌리지 않는다** — 결과는 응답의 `emailSent` 로 본다.',
  })
  @ApiOkResponse({ type: AdminAccountCreateResponseDto })
  async create(
    @Body() dto: AdminAccountCreateRequestDto,
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): Promise<AdminAccountCreateResponseDto> {
    const account = await this.accounts.create(dto, actorOf(current, req));

    /*
      **메일은 계정을 만든 뒤에, 여기서 보낸다.**

      계정 서비스 안으로 넣지 않은 것은 메일이 "관리자를 만든다" 는 일의 일부가 아니라
      콘솔이라는 통로의 부가 동작이기 때문이다 — CLI 로 만든 계정은 메일을 보내지 않고,
      계정 계층(AdminAuthModule)은 발송기를 지고 뜰 이유가 없다.

      **평문 비밀번호가 필요해서 여기서만 가능하기도 하다.** 저장되는 것은 해시뿐이라,
      만든 뒤에 다시 꺼내 보낼 수 있는 값이 아니다.
    */
    const mail = dto.sendEmail
      ? await this.mail.sendAccountCreated({
          email: account.email,
          name: account.name,
          password: dto.password,
        })
      : undefined;

    return new AdminAccountCreateResponseDto(account, mail);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '관리자 수정',
    description:
      '이메일·표시 이름·등급·언어·시간대를 고친다. **보낸 항목만 바뀐다.**\n\n' +
      '이메일은 로그인 식별자라 바꾸면 **옛 주소로는 로그인할 수 없다.** ' +
      '살아 있는 세션은 끊기지 않는다 — 인증은 관리자 번호로 걸려 있어 주소가 바뀌어도 이어진다.\n\n' +
      '**등급이 자기보다 높은 계정은 고칠 수 없고, 자기보다 높은 등급으로 올릴 수도 없다**(403).',
  })
  @ApiOkResponse({ type: AdminAccountDetailDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminAccountUpdateRequestDto,
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): Promise<AdminAccountDetailDto> {
    return new AdminAccountDetailDto(await this.accounts.update(id, dto, actorOf(current, req)));
  }

  @Post(':id/password')
  @HttpCode(200)
  @ApiOperation({
    summary: '비밀번호 초기화',
    description:
      '**현재 비밀번호를 묻지 않는다** — 본인이 값을 잃어버렸을 때 다른 관리자가 다시 내주는 경로다.\n\n' +
      '기본은 **첫 로그인에서 비밀번호 변경을 강제**하고 **살아 있는 세션도 함께 끊는다** ' +
      '(`mustChangePassword`·`revokeSessions` 로 각각 끌 수 있다). ' +
      '**자기보다 높은 등급의 계정에는 쓸 수 없다**(403) — 열어 두면 상급 계정을 그대로 가져갈 수 있다. ' +
      '**자기 자신에게는 쓸 수 없다** — 본인 것은 비밀번호 변경(`POST /auth/password`)으로 바꾼다.',
  })
  @ApiOkResponse({ type: AdminPasswordResetResponseDto })
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminPasswordResetRequestDto,
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): Promise<AdminPasswordResetResponseDto> {
    const account = await this.accounts.resetPassword(id, actorOf(current, req), dto.password, {
      revokeSessions: dto.revokeSessions,
      mustChangePassword: dto.mustChangePassword,
    });

    // 계정을 만들 때와 같은 이유로 여기서 보낸다 — 컨트롤러의 create 주석 참고.
    const mail = dto.sendEmail
      ? await this.mail.sendPasswordReset({
          email: account.email,
          name: account.name,
          password: dto.password,
        })
      : undefined;

    return new AdminPasswordResetResponseDto(mail);
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: '관리자의 로그인 기기',
    description:
      '살아 있는 로그인 세션을 최근 활동 순으로 돌려준다. 만료된 세션은 빠진다.\n\n' +
      '**DB 와 캐시를 따로 읽어 합친다.** 목록의 정본은 DB 지만 요청을 실제로 통과시키는 ' +
      '것은 인증 캐시라, 어긋나는 쪽(`orphans`: 세션은 지워졌는데 캐시만 남은 것)을 감추면 ' +
      '"끊었는데 왜 아직 되지" 를 짚을 수 없다.',
  })
  @ApiOkResponse({ type: AdminSessionListDto })
  async sessions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() current: AdminAuthUser,
  ): Promise<AdminSessionListDto> {
    // 없는 관리자면 서비스가 404 를 던진다 — 빈 목록과 구별되어야 한다.
    const [rows, cached] = await Promise.all([
      this.accounts.listSessions(id),
      this.sessionCache.listByAdmin(id),
    ]);

    const caches = await Promise.all(
      rows.map((session) => this.sessionCache.inspect(id, session.sessionId)),
    );
    /*
      **지금 이 요청을 보낸 세션에 표를 단다.** 화면에서 줄들이 서로 똑같이 생겨서,
      본인 계정을 보다 자기가 앉아 있는 기기를 끊고 튕겨 나가는 일이 실제로 일어난다.
    */
    const sessions = rows.map(
      (session, index) =>
        new AdminSessionDto(session, caches[index], session.sessionId === current.sessionId),
    );

    // DB 에 없는데 캐시에만 있는 것 = 폐기 때 캐시 삭제가 새어 남은 것.
    const live = new Set(rows.map((row) => row.sessionId));
    const orphans = cached
      .filter((entry) => !live.has(entry.sessionId))
      .map((entry) => new OrphanAdminSessionCacheDto(entry));

    return new AdminSessionListDto(sessions, orphans);
  }

  @Get(':id/sessions/:sessionId/cache')
  @ApiOperation({
    summary: '세션 캐시 상태',
    description:
      '이 세션의 인증 캐시에 담긴 값을 그대로 돌려준다. 무엇이 들어 있어서 통과하는지를 ' +
      '눈으로 확인하는 통로다.\n\n' +
      'DB 행이 없는 세션(고아 캐시)도 조회된다 — 오히려 그때 들여다볼 일이 많다.',
  })
  @ApiOkResponse({ type: AdminCacheStateDto })
  async sessionCacheState(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<AdminCacheStateDto> {
    /*
      **세션이 있는지는 확인하지 않는다.** 고아 캐시가 이 통로의 주된 대상이라 행이 있어야만
      열리면 정작 봐야 할 것을 못 본다 — 키에 관리자번호가 박혀 있어 남의 것은 애초에 열리지 않는다.
    */
    return new AdminCacheStateDto(await this.sessionCache.inspect(id, sessionId));
  }

  @Delete(':id/sessions')
  @HttpCode(204)
  @ApiOperation({
    summary: '관리자의 모든 기기 로그아웃',
    description:
      '이 관리자의 로그인 세션을 전부 폐기하고 그 인증 캐시도 함께 비운다.\n\n' +
      '**계정이 잠기는 것은 아니다** — 비밀번호를 아는 사람이면 곧바로 다시 로그인한다. ' +
      '자격을 끊으려면 비밀번호 초기화 쪽이다.\n\n' +
      '**자기보다 높은 등급의 계정에는 쓸 수 없다**(403).',
  })
  @ApiNoContentResponse()
  async revokeAllSessions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.accounts.revokeAllSessions(id, actorOf(current, req));
  }

  @Delete(':id/sessions/:sessionId')
  @HttpCode(204)
  @ApiOperation({
    summary: '관리자의 기기 한 대 로그아웃',
    description:
      '세션 하나를 폐기하고 그 인증 캐시를 비운다. 그 관리자의 세션이 아니면 404 다.\n\n' +
      '**자기 자신에게도 쓸 수 있다** — 두고 온 기기를 끊는 것이 정상 용례라, 지금 쓰는 ' +
      '세션을 끊으면 그 자리에서 로그인 화면으로 나갈 뿐이다.',
  })
  @ApiNoContentResponse()
  async revokeSession(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): Promise<void> {
    const removed = await this.accounts.revokeSession(id, sessionId, actorOf(current, req));
    if (!removed) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
  }

  @Get(':id/cache')
  @ApiOperation({
    summary: '내 정보 캐시 상태',
    description:
      '이 관리자의 `GET /api/admins/me` 응답이 캐시에 올라가 있는지와 담긴 값을 돌려준다.\n\n' +
      '**세션 캐시와 다른 것이다.** 그쪽은 가드가 요청마다 보는 판단(살아 있나)이라 기기 ' +
      '목록에 붙어 있고, 이쪽은 화면에 뿌리는 값이라 틀리면 옛 값이 보인다.',
  })
  @ApiOkResponse({ type: AdminCacheStateDto })
  async cacheState(@Param('id', ParseIntPipe) id: number): Promise<AdminCacheStateDto> {
    // 없는 관리자와 "캐시가 비어 있다" 는 화면에서 구별돼야 한다.
    await this.accounts.require(id);
    return new AdminCacheStateDto(await this.profileCache.inspect(id));
  }

  @Post(':id/cache/purge')
  @HttpCode(204)
  @ApiOperation({
    summary: '내 정보 캐시 초기화',
    description:
      '이 관리자의 내 정보 캐시를 비운다. 다음 조회가 DB 를 다시 읽는다.\n\n' +
      '값이 바뀔 때 서버가 이미 지우므로 평소에는 누를 일이 없다 — 고친 내용이 화면에 ' +
      '안 보일 때만 쓴다.',
  })
  @ApiNoContentResponse()
  async purgeCache(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.accounts.require(id);
    await this.profileCache.purge(id);
  }

  @Post(':id/sessions/:sessionId/cache/purge')
  @HttpCode(204)
  @ApiOperation({
    summary: '세션 캐시 한 칸 초기화',
    description:
      '캐시 한 칸만 비운다. 규칙은 전체 초기화와 같다.\n\n' +
      '**DB 행이 없는 칸(orphan)도 지울 수 있다** — 오히려 그때 쓸 일이 많다. ' +
      '그래서 세션이 있는지는 확인하지 않고, 이 관리자의 키인지만 본다(키에 번호가 박혀 있다).',
  })
  @ApiNoContentResponse()
  async purgeSessionCache(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<void> {
    assertPurged((await this.sessionCache.purge(id, sessionId)) ? [] : [sessionId]);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '관리자 삭제',
    description:
      '**계정 행은 남기고 지운 표시만 한다**(소프트 삭제). 로그인은 곧바로 막히고 세션도 ' +
      '함께 끊기지만, 목록(`deleted=true`)과 상세에서는 계속 보인다 — 계정 번호가 조치 ' +
      '기록이 가리키는 대상이라 행이 사라지면 그 번호가 누구였는지 알 수 없어진다.\n\n' +
      '지운 계정은 고칠 수도, 비밀번호를 다시 낼 수도 없다(404). 같은 이메일로 새 계정은 만들 수 있다.\n\n' +
      '**자기 자신과 마지막 남은 계정은 지울 수 없다** — ' +
      '지우고 나면 아무도 로그인하지 못하고, 계정을 되살리려면 서버에서 CLI 를 돌려야 한다.\n\n' +
      '**자기보다 높은 등급의 계정과 마지막 시스템 관리자도 지울 수 없다**(403 / 400).',
  })
  @ApiNoContentResponse()
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.accounts.remove(id, actorOf(current, req));
  }

  @Get(':id/action-logs')
  @ApiOperation({
    summary: '관리자 기록',
    description:
      '로그인·로그아웃·비밀번호 변경과 계정 관리 조치(생성·수정·삭제·비밀번호 초기화)를 최근 순으로 돌려준다.\n\n' +
      '**이 관리자가 한 일과 당한 일을 함께 준다** — "누가 내 계정을 지웠나" 가 되짚을 값이라, ' +
      '주체(`adminId`)와 대상(`targetAdminId`) 어느 쪽이든 이 번호면 포함한다.\n\n' +
      '기본은 **전체 기간·전체 종류**이고, 기간(`from`·`to`)과 종류(`actions`)로 좁힐 수 있다.',
  })
  @ApiPageResponse(AdminActionLogDto)
  async actionLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AdminActionLogQueryDto,
  ): Promise<PageResponseDto<AdminActionLogDto>> {
    /*
      **관리자가 있는지 먼저 본다.** 로그는 별도 DB 라 없는 번호로 물어도 그냥 빈 목록이
      돌아온다 — 주소를 잘못 짚은 것과 "기록이 없는 계정" 이 화면에서 구별되지 않는다.
    */
    const admin = await this.accounts.findById(id);
    if (!admin) {
      throw new NotFoundException(`Admin not found: ${id}`);
    }

    const page = await this.logs.list({
      adminId: id,
      page: query.page,
      size: query.size,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      actions: query.actions,
    });
    return PageResponseDto.from(page.map((entry) => new AdminActionLogDto(entry)));
  }
}

/**
 * 조치를 한 사람 + 어디서 했는지. **기록에 실린다.**
 *
 * 번호만으로는 되짚기에 모자란 순간이 있어(공용 자리, 자리 비운 사이의 조작) 접속 정보를
 * 함께 넘긴다. IP 를 뽑는 규칙은 인증 쪽과 같은 함수를 쓴다 — 프록시 뒤에서 갈리면 안 된다.
 */
/**
 * 지우지 못한 칸이 있으면 알린다.
 *
 * **조용히 204 를 주지 않는다.** 이 캐시가 남아 있으면 잘못 남은 칸(orphan)의 기기가
 * 그대로 통과하는데, 성공으로 답하면 관리자는 막힌 줄 안다. 다시 눌러 재시도할 수 있고
 * (삭제는 멱등이다), 그대로 둬도 수명이 지나면 사라진다.
 */
function assertPurged(left: readonly number[]): void {
  if (left.length === 0) return;
  throw new ServiceUnavailableException(
    `${left.length} cache entries could not be cleared. ` +
      'Those sessions may keep passing until the cache expires. Retry to clear them.',
  );
}

function actorOf(current: AdminAuthUser, req: Request): AdminActor {
  const meta = requestMeta(req);
  return {
    adminId: current.adminId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}
