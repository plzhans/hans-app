import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AdminEmailService } from '@hansapp/admin-application';
import {
  AdminAuthService,
  AdminPasswordResetService,
  AdminPublic,
  AllowDuringPasswordChange,
  CurrentAdmin,
} from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import {
  clearAdminCookies,
  readRefreshCookie,
  requestMeta,
  respondTokens,
} from './admin-cookie';
import {
  AdminChangePasswordRequestDto,
  AdminForgotPasswordRequestDto,
  AdminLoginRequestDto,
  AdminResetPasswordRequestDto,
  AdminMeResponseDto,
  AdminPasswordResetTargetDto,
  AdminTokenResponseDto,
  AdminUpdateLocaleRequestDto,
} from './dto/admin-auth.dto';

/**
 * 관리자 인증.
 *
 * refresh token 은 httpOnly 쿠키로만 오가고, 바디에는 access token 만 담는다.
 * 이 컨트롤러의 경로가 `/auth/*` 인 것은 refresh 쿠키의 path 와 맞추기 위해서다 —
 * 업무 API 는 `/api/*` 아래에 둬서 쿠키가 실리지 않게 한다.
 */
@ApiTags('admin-auth')
@Controller('auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reset: AdminPasswordResetService,
    private readonly mail: AdminEmailService,
  ) {}

  @Post('login')
  @AdminPublic()
  // 비밀번호 무차별 대입 방지(IP 기준). 전역 한도보다 타이트하게 잡는다.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @ApiOperation({
    summary: '관리자 로그인',
    description:
      '이메일/비밀번호로 로그인한다. refresh token 은 httpOnly 쿠키로 내려간다.',
  })
  @ApiOkResponse({ type: AdminTokenResponseDto })
  async login(
    @Body() dto: AdminLoginRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminTokenResponseDto> {
    const tokens = await this.auth.login(dto, requestMeta(req));
    return respondTokens(res, tokens);
  }

  @Post('token')
  @AdminPublic()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @ApiOperation({
    summary: 'access token 갱신',
    description:
      'httpOnly 쿠키의 refresh token 으로 access token 을 갱신한다. ' +
      'refresh token 도 함께 rotate 되어 새 쿠키로 다시 내려간다.',
  })
  @ApiOkResponse({ type: AdminTokenResponseDto })
  async token(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminTokenResponseDto> {
    /*
      **쿠키에서만 읽는다.** 공개 API 는 바디의 refresh_token 도 받는데, 그건 모바일처럼
      쿠키를 못 쓰는 클라이언트를 위한 것이다. 관리자 클라이언트는 같은 오리진 SPA 하나뿐이라
      바디 경로를 열어 두면 쓰이지도 않으면서 공격 표면만 남는다.

      CSRF 는 sameSite=strict 가 막는다 — 다른 사이트에서 시작된 요청에는 이 쿠키가 아예
      실리지 않으므로, 공개 API 처럼 Origin 을 따로 대조할 필요가 없다.
    */
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) {
      throw new BadRequestException('Refresh token cookie is required.');
    }
    const tokens = await this.auth.refresh(refreshToken);
    return respondTokens(res, tokens);
  }

  @Delete('logout')
  @AdminPublic()
  @HttpCode(204)
  @ApiOperation({
    summary: '로그아웃',
    description: '세션을 폐기하고 쿠키를 지운다.',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    /*
      **아무 자격증명도 요구하지 않는다.** 로그아웃은 "잊는" 동작이라 인증을 걸면 안 된다 —
      access token 이 만료됐을 때 가드가 401 로 끊으면 이 응답에 쿠키 삭제도 안 실려 세션이
      살아남는다. 공개 API 에서 실제로 그래서 로그아웃이 안 되는 일이 있었다.
    */
    await this.auth.logout(readRefreshCookie(req), requestMeta(req));
    clearAdminCookies(res);
  }

  @Get('me')
  // 비밀번호를 바꿔야 하는 상태에서도 자기 정보는 읽을 수 있어야 한다 —
  // 변경 화면이 "누구로 로그인했는지" 를 보여준다.
  @AllowDuringPasswordChange()
  @ApiOperation({ summary: '현재 로그인한 관리자' })
  @ApiOkResponse({ type: AdminMeResponseDto })
  async me(
    @CurrentAdmin() current: AdminAuthUser,
  ): Promise<AdminMeResponseDto> {
    const admin = await this.auth.findById(current.adminId);
    if (!admin) {
      // 토큰은 유효한데 계정이 사라졌다. 세션 정리가 못 따라온 경우다.
      throw new NotFoundException('Admin not found.');
    }
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      mustChangePassword: admin.mustChangePassword,
      role: admin.role,
      language: admin.language,
      timeZone: admin.timeZone,
    };
  }

  @Patch('me')
  @HttpCode(204)
  @ApiOperation({
    summary: '내 언어·타임존 변경',
    description:
      '관리 화면과 메일에 쓰는 언어·타임존을 바꾼다. 보낸 항목만 바뀐다.',
  })
  async updateMe(
    @CurrentAdmin() current: AdminAuthUser,
    @Body() dto: AdminUpdateLocaleRequestDto,
  ): Promise<void> {
    await this.auth.updateOwnLocale(current.adminId, dto);
  }

  @Post('password/forgot')
  @AdminPublic()
  /*
    **로그인보다 더 조인다.** 메일을 보내는 경로라 한 번이 남의 메일함에 도착하고,
    폭주하면 그 자체가 괴롭힘이 된다. 계정당 시간 한도는 서비스가 따로 본다(IP 와 계정은
    다른 축이라 둘 다 필요하다).
  */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(204)
  @ApiOperation({
    summary: '비밀번호 찾기(메일 발송)',
    description:
      '재설정 링크를 메일로 보낸다. 링크는 **30분·1회용**이고, 새로 요청하면 그 계정의 안 쓴 링크는 죽는다.\n\n' +
      '**계정이 있든 없든 같은 응답(204)이다** — 이 주소가 관리자인지를 알려 주면 표적을 좁혀 준다. ' +
      '메일 발송이 꺼져 있으면 아무것도 나가지 않는다(설정 > 메일).',
  })
  @ApiNoContentResponse()
  async forgotPassword(
    @Body() dto: AdminForgotPasswordRequestDto,
    @Req() req: Request,
  ): Promise<void> {
    const ticket = await this.reset.issue(dto.email, requestMeta(req));
    /*
      **티켓이 없으면 조용히 끝낸다.** 없는 계정·비활성 계정·한도 초과가 전부 여기로 오는데,
      어느 쪽인지 응답에서 갈리면 위에서 숨긴 것이 그대로 새어 나간다. 무슨 일이 있었는지는
      로그(admin_action_log)에만 남는다.
    */
    if (!ticket) return;

    await this.mail.sendPasswordResetLink({
      email: ticket.email,
      name: ticket.name,
      token: ticket.token,
      expiresAt: ticket.expiresAt,
    });
  }

  @Get('password/reset')
  @AdminPublic()
  // 토큰을 찍어 맞히려는 시도도 무차별 대입이다. 재설정 자체와 같은 한도를 건다.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: '재설정 링크의 대상',
    description:
      '이 링크가 **누구의 것인지**(가린 이메일)와 언제까지 유효한지를 준다. 재설정 화면이 열릴 때 부른다.\n\n' +
      '링크가 죽었으면 400 이다 — 폼을 다 채우고 누른 뒤에야 만료를 알게 되지 않도록 미리 본다.',
  })
  @ApiOkResponse({ type: AdminPasswordResetTargetDto })
  async resetTarget(
    @Query('token') token: string,
  ): Promise<AdminPasswordResetTargetDto> {
    return new AdminPasswordResetTargetDto(await this.reset.describe(token));
  }

  @Post('password/reset')
  @AdminPublic()
  // 토큰을 찍어 맞히려는 시도도 무차별 대입이다. 로그인과 같은 한도를 건다.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(204)
  @ApiOperation({
    summary: '비밀번호 찾기(새 비밀번호 설정)',
    description:
      '메일로 받은 링크의 토큰으로 비밀번호를 다시 세운다. 링크는 한 번만 쓸 수 있다.\n\n' +
      '성공하면 **그 계정의 살아 있는 세션이 모두 끊긴다** — 비밀번호를 잃은 이유가 계정을 ' +
      '빼앗긴 것일 수도 있다. 새 값은 본인이 정한 것이라 첫 로그인에서 다시 바꾸라고 하지 않는다.',
  })
  @ApiNoContentResponse()
  async resetPassword(
    @Body() dto: AdminResetPasswordRequestDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.reset.consume(dto.token, dto.newPassword, requestMeta(req));
  }

  @Post('password')
  // **강제 변경 상태에서 유일하게 열려 있는 업무 경로다.** 이게 막히면 빠져나갈 길이 없다.
  @AllowDuringPasswordChange()
  // 현재 비밀번호를 맞히려는 시도도 무차별 대입이다. 로그인과 같은 한도를 건다.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @ApiOperation({
    summary: '비밀번호 변경',
    description:
      '본인의 비밀번호를 바꾼다. 현재 비밀번호를 확인하고, 성공하면 **기존 세션을 모두 끊고** ' +
      '새 세션을 발급한다(응답의 access token 과 새 쿠키를 그대로 쓰면 된다).',
  })
  @ApiOkResponse({ type: AdminTokenResponseDto })
  async changePassword(
    @CurrentAdmin() current: AdminAuthUser,
    @Body() dto: AdminChangePasswordRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminTokenResponseDto> {
    const tokens = await this.auth.changeOwnPassword(
      current.adminId,
      dto,
      requestMeta(req),
    );
    return respondTokens(res, tokens);
  }
}
