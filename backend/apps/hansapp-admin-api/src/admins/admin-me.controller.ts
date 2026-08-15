import { Body, Delete, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { AdminNotFoundError } from '@hansapp/admin-application';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import type { Request } from 'express';
import {
  AdminAuthService,
  AdminProfileCache,
  AdminSocialService,
  AdminSocialTicketService,
  AllowDuringPasswordChange,
  CurrentAdmin,
} from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import { requestMeta } from '../auth/admin-cookie';
import { externalBaseUrl } from '../auth/admin-social-flow';
import { AdminSocialLinkDto, AdminSocialLinkStartResponseDto } from '../auth/dto/admin-social.dto';
import { AdminMeResponseDto, AdminUpdateLocaleRequestDto } from '../auth/dto/admin-auth.dto';

/**
 * 로그인한 관리자 본인의 정보.
 *
 * **인증(`/auth/*`)에서 갈라 두었다.** 그쪽은 자격을 주고받는 흐름(로그인·갱신·로그아웃·
 * 비밀번호 찾기·소셜 콜백)이고, 여기는 그 자격으로 읽는 **계정 정보**다 — 같은 `/auth`
 * 아래 두면 "인증 API" 를 여는 사람이 계정 필드를 함께 만나고, 계정 화면을 고치는 사람이
 * 인증 흐름을 뒤지게 된다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 이 요청들에 실리지 않게 하려는 것이다.
 * **그래서 `me` 는 `:id` 보다 먼저 등록돼야 한다** — 컨트롤러 등록 순서(app.module)가
 * 그것을 지킨다. 뒤에 서면 `/api/admins/me` 가 `:id` 에 잡혀 400 이 된다.
 */
@ApiTags('admins.me')
@ApiController('api/admins/me')
export class AdminMeController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly profileCache: AdminProfileCache,
    private readonly social: AdminSocialService,
    private readonly tickets: AdminSocialTicketService,
  ) {}

  @Get()
  /*
    **비밀번호를 바꿔야 하는 상태에서도 열린다.** 화면이 "지금 누구로 로그인했는지" 를
    보여 주고, 무엇보다 이 응답의 `mustChangePassword` 로 변경 화면에 들어간다 —
    막아 두면 그 상태를 알 방법이 없어 콘솔이 빈 화면에서 멈춘다.
  */
  @AllowDuringPasswordChange()
  @ApiOperation({
    summary: '현재 로그인한 관리자',
    description:
      '**응답이 캐싱된다**(기본 10분). 값이 바뀌는 경로(로그인·수정·비밀번호·삭제)가 그 캐시를 ' +
      '직접 지우므로 화면이 옛 값을 보는 일은 없고, 수명은 그 삭제를 빠뜨렸을 때의 안전망이다.',
  })
  @ApiOkResponse({ type: AdminMeResponseDto })
  async me(@CurrentAdmin() current: AdminAuthUser): Promise<AdminMeResponseDto> {
    const me = await this.profileCache.read<AdminMeResponseDto>(current.adminId, async () => {
      const admin = await this.auth.findById(current.adminId);
      if (!admin) return null;
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
    });

    if (!me) {
      // 토큰은 유효한데 계정이 사라졌다. 세션 정리가 못 따라온 경우다.
      throw new AdminNotFoundError();
    }
    return me;
  }

  @Patch()
  @HttpCode(204)
  @ApiOperation({
    summary: '내 언어·타임존 변경',
    description: '관리 화면과 메일에 쓰는 언어·타임존을 바꾼다. 보낸 항목만 바뀐다.',
  })
  @ApiNoContentResponse()
  async updateMe(
    @CurrentAdmin() current: AdminAuthUser,
    @Body() dto: AdminUpdateLocaleRequestDto,
  ): Promise<void> {
    await this.auth.updateOwnLocale(current.adminId, dto);
  }

  @Get('social')
  @ApiOperation({ summary: '내 소셜 연동 목록' })
  @ApiOkResponse({ type: AdminSocialLinkDto, isArray: true })
  async socialLinks(@CurrentAdmin() current: AdminAuthUser): Promise<AdminSocialLinkDto[]> {
    return this.social.list(current.adminId);
  }

  @Post('social/google/link')
  @ApiOperation({
    summary: '구글 연동 시작 주소 발급',
    description: '3분짜리 티켓을 박은 시작 주소를 내준다. 화면은 이 주소로 이동만 하면 된다.',
  })
  @ApiOkResponse({ type: AdminSocialLinkStartResponseDto })
  linkStart(
    @CurrentAdmin() current: AdminAuthUser,
    @Req() req: Request,
  ): AdminSocialLinkStartResponseDto {
    const ticket = this.tickets.signLinkTicket(current.adminId);
    /*
      **시작 주소는 `/auth/social/google` 이다.** 브라우저가 통째로 떠났다 돌아오는 흐름이라
      인증 쪽에 남는다 — 여기서 내주는 것은 "그 흐름을 시작할 자격(티켓)" 뿐이다.
    */
    return {
      startUrl: `${externalBaseUrl(req)}/auth/social/google?link_token=${encodeURIComponent(ticket)}`,
    };
  }

  @Delete('social/google')
  @HttpCode(204)
  @ApiOperation({
    summary: '구글 연동 해제',
    description:
      '붙어 있지 않아도 204 다. **비밀번호 로그인은 그대로 남으므로** 해제로 계정이 잠기지 않는다.',
  })
  @ApiNoContentResponse()
  async unlink(@CurrentAdmin() current: AdminAuthUser, @Req() req: Request): Promise<void> {
    await this.social.unlink(current.adminId, requestMeta(req));
  }
}
