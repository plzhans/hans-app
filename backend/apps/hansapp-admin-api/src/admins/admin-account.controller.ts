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
  Req,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import {
  AdminActionLogReadService,
  AdminEmailService,
} from '@hansapp/admin-application';
import {
  AdminAccountService,
  CurrentAdmin,
} from '@hansapp/admin-application/auth';
import type {
  AdminActor,
  AdminAuthUser,
} from '@hansapp/admin-application/auth';

import { requestMeta } from '../auth/admin-cookie';
import {
  AdminAccountCreateRequestDto,
  AdminAccountCreateResponseDto,
  AdminAccountDetailDto,
  AdminAccountSummaryDto,
  AdminAccountUpdateRequestDto,
  AdminActionLogDto,
  AdminActionLogQueryDto,
  AdminPasswordResetRequestDto,
  AdminPasswordResetResponseDto,
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
@ApiTags('admin-account')
@Controller('api/admins')
export class AdminAccountController {
  constructor(
    private readonly accounts: AdminAccountService,
    private readonly mail: AdminEmailService,
    private readonly logs: AdminActionLogReadService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '관리자 목록',
    description: '번호 순. **페이징이 없다** — 계정 수가 적어 나눌 것이 없다.',
  })
  @ApiOkResponse({ type: [AdminAccountSummaryDto] })
  async list(): Promise<AdminAccountSummaryDto[]> {
    const admins = await this.accounts.list();
    return admins.map((admin) => new AdminAccountSummaryDto(admin));
  }

  @Get(':id')
  @ApiOperation({ summary: '관리자 상세' })
  @ApiOkResponse({ type: AdminAccountDetailDto })
  async detail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminAccountDetailDto> {
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
      '이메일·표시 이름을 고친다. **보낸 항목만 바뀐다.**\n\n' +
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
    return new AdminAccountDetailDto(
      await this.accounts.update(id, dto, actorOf(current, req)),
    );
  }

  @Post(':id/password')
  @HttpCode(200)
  @ApiOperation({
    summary: '비밀번호 초기화',
    description:
      '**현재 비밀번호를 묻지 않는다** — 본인이 값을 잃어버렸을 때 다른 관리자가 다시 내주는 경로다.\n\n' +
      '이 계정의 **살아 있는 세션을 모두 끊고**, 본인이 첫 로그인에서 비밀번호를 다시 바꾸게 만든다. ' +
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
    const account = await this.accounts.resetPassword(
      id,
      actorOf(current, req),
      dto.password,
    );

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

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '관리자 삭제',
    description:
      '계정과 그 세션을 지운다. **자기 자신과 마지막 남은 계정은 지울 수 없다** — ' +
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
    return PageResponseDto.from(
      page.map((entry) => new AdminActionLogDto(entry)),
    );
  }
}

/**
 * 조치를 한 사람 + 어디서 했는지. **기록에 실린다.**
 *
 * 번호만으로는 되짚기에 모자란 순간이 있어(공용 자리, 자리 비운 사이의 조작) 접속 정보를
 * 함께 넘긴다. IP 를 뽑는 규칙은 인증 쪽과 같은 함수를 쓴다 — 프록시 뒤에서 갈리면 안 된다.
 */
function actorOf(current: AdminAuthUser, req: Request): AdminActor {
  const meta = requestMeta(req);
  return {
    adminId: current.adminId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}
