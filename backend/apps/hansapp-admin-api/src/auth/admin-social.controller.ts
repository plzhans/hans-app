import { Controller, Delete, Get, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AdminGoogleClient,
  AdminPublic,
  AdminSocialError,
  AdminSocialService,
  AdminSocialTicketService,
  CurrentAdmin,
} from '@hansapp/admin-application/auth';
import type { AdminAuthUser, AdminSocialErrorCode } from '@hansapp/admin-application/auth';

import { requestMeta, setAdminCookies } from './admin-cookie';
import {
  consoleUrl,
  externalBaseUrl,
  googleCallbackUrl,
  issueFlowNonce,
  verifyFlowNonce,
} from './admin-social-flow';
import {
  AdminSocialLinkDto,
  AdminSocialLinkStartResponseDto,
  AdminSocialProviderResponseDto,
} from './dto/admin-social.dto';

/** 연동을 마치고 돌아가는 화면. 마이 페이지다. */
const LINK_RETURN_PATH = '/me';

/**
 * 관리자 소셜 로그인(구글).
 *
 * **콜백은 JSON 이 아니라 리다이렉트로 끝난다.** 브라우저가 구글에서 곧장 돌아오는 요청이라
 * 화면이 받아야 하고, 실패도 마찬가지다 — 실패 사유는 쿼리(`social_error`)로 실어 보낸다.
 *
 * 로그인이 성립하면 **여기서 로그인 쿠키를 심고** 콘솔로 보낸다. 화면은 평소의 부팅 경로
 * (세션 힌트 쿠키를 보고 `/auth/token` 호출)를 그대로 타므로 새 교환 절차가 없다.
 */
@ApiTags('admin-auth')
@Controller('auth')
export class AdminSocialController {
  private readonly logger = new Logger(AdminSocialController.name);

  constructor(
    private readonly google: AdminGoogleClient,
    private readonly social: AdminSocialService,
    private readonly tickets: AdminSocialTicketService,
  ) {}

  @Get('social/providers')
  @AdminPublic()
  @ApiOperation({
    summary: '쓸 수 있는 소셜 로그인',
    description: '설정이 채워진 provider 만 true 다. 로그인 화면이 버튼을 그릴지 정한다.',
  })
  @ApiOkResponse({ type: AdminSocialProviderResponseDto })
  async providers(): Promise<AdminSocialProviderResponseDto> {
    return { google: await this.google.isConfigured() };
  }

  @Get('social/google')
  @AdminPublic()
  // 구글로 나가는 리다이렉트를 무한정 찍어내지 않게 막는다. 사람이 누르는 버튼이다.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: '구글 로그인/연동 시작',
    description:
      '구글 인가 화면으로 리다이렉트한다. `link_token` 이 있으면 로그인이 아니라 **연동**으로 시작한다.',
  })
  async start(
    @Req() req: Request,
    @Res() res: Response,
    @Query('link_token') linkToken?: string,
    @Query('return_to') returnTo?: string,
  ): Promise<void> {
    /*
      **연동 의도는 티켓으로만 성립한다.** 쿼리의 admin_id 같은 값을 믿으면 남의 계정에
      제 구글을 붙일 수 있다.

      티켓이 죽었으면(3분) 마이 페이지로 돌려보낸다 — 이 요청도 브라우저 이동이라
      JSON 오류를 띄우면 사람이 빈 화면을 본다.
    */
    let adminId: number | undefined;
    if (linkToken) {
      try {
        adminId = this.tickets.verifyLinkTicket(linkToken);
      } catch {
        res.redirect(consoleUrl(LINK_RETURN_PATH, { social_error: 'failed' }));
        return;
      }
    }
    const { flowId, nonce } = issueFlowNonce(res);

    const state = this.tickets.signState({
      intent: adminId ? 'link' : 'login',
      adminId,
      // 콘솔 안의 경로만 싣는다. 바깥으로 나가는 값은 consoleUrl 이 마지막으로 한 번 더 막는다.
      returnTo: adminId ? LINK_RETURN_PATH : sanitizeReturnTo(returnTo),
      flowId,
      nonce,
    });

    res.redirect(await this.google.authorizeUrl({ redirectUri: googleCallbackUrl(req), state }));
  }

  @Get('social/google/callback')
  @AdminPublic()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: '구글 콜백',
    description:
      '구글이 인가코드를 실어 보내는 곳이다(승인된 리디렉션 URI). 로그인이 성립하면 쿠키를 심고 콘솔로 리다이렉트한다.',
  })
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') rawState?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    // 사용자가 구글 화면에서 취소한 경우다. 실패로 다루지 않고 조용히 로그인 화면으로 돌린다.
    if (error === 'access_denied') {
      res.redirect(consoleUrl('/login'));
      return;
    }
    if (!code || !rawState) {
      res.redirect(consoleUrl('/login', { social_error: 'failed' }));
      return;
    }

    /*
      **state 검증도 try 안이다.** 서명이 깨졌거나 만료된 state 는 예외로 끝나는데, 그것이
      그대로 나가면 사람이 구글에서 돌아와 JSON 오류 화면을 본다 — 이 경로의 모든 실패는
      화면으로 돌아가야 한다.

      **순서가 중요하다.** 흐름 소유권(쿠키)을 코드 교환보다 먼저 본다 — 남의 흐름으로
      계정이 연동되거나 세션이 만들어지는 부수효과가 생기기 전에 끊어야 한다.
    */
    let failPath = '/login';
    try {
      const state = this.tickets.verifyState(rawState);
      failPath = state.intent === 'link' ? LINK_RETURN_PATH : '/login';

      if (!verifyFlowNonce(req, res, state)) {
        res.redirect(consoleUrl(failPath, { social_error: 'failed' }));
        return;
      }

      const profile = await this.google.exchange(code, googleCallbackUrl(req));
      const meta = requestMeta(req);

      if (state.intent === 'link') {
        // 티켓이 만들어질 때 확정된 값이라 여기서 다시 인증하지 않는다(요청에 토큰이 없다).
        // 값이 비어 있으면 우리가 만든 state 가 아니거나 깨진 것이다 — 붙일 대상이 없다.
        if (!state.adminId) {
          res.redirect(consoleUrl(LINK_RETURN_PATH, { social_error: 'failed' }));
          return;
        }
        await this.social.link(state.adminId, profile, meta);
        res.redirect(consoleUrl(LINK_RETURN_PATH, { social: 'linked' }));
        return;
      }

      const tokens = await this.social.loginWithGoogle(profile, meta);
      setAdminCookies(res, tokens);
      /*
        **access token 을 URL 에 싣지 않는다.** 화면은 세션 힌트 쿠키를 보고 `/auth/token` 으로
        받아간다 — 주소창·브라우저 기록·리퍼러에 토큰이 남는 길을 아예 만들지 않는다.
      */
      res.redirect(consoleUrl(state.returnTo ?? '/'));
    } catch (raw) {
      const errorCode = toErrorCode(raw);
      // 사유는 로그에만 남긴다. 화면에는 코드 하나만 간다.
      this.logger.warn(`구글 소셜 흐름 실패(code=${errorCode}): ${String(raw)}`);
      res.redirect(consoleUrl(failPath, { social_error: errorCode }));
    }
  }

  @Post('me/social/google/link')
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
    return {
      startUrl: `${externalBaseUrl(req)}/auth/social/google?link_token=${encodeURIComponent(ticket)}`,
    };
  }

  @Get('me/social')
  @ApiOperation({ summary: '내 소셜 연동 목록' })
  @ApiOkResponse({ type: AdminSocialLinkDto, isArray: true })
  async list(@CurrentAdmin() current: AdminAuthUser): Promise<AdminSocialLinkDto[]> {
    return this.social.list(current.adminId);
  }

  @Delete('me/social/google')
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

/** 로그인 뒤 돌아갈 콘솔 경로. 바깥 주소는 받지 않는다. */
function sanitizeReturnTo(raw?: string): string | undefined {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return undefined;
  return raw;
}

/** 실패를 화면이 읽을 코드로 바꾼다. 우리가 모르는 실패는 전부 `failed` 다. */
function toErrorCode(raw: unknown): AdminSocialErrorCode {
  return raw instanceof AdminSocialError ? raw.code : 'failed';
}
