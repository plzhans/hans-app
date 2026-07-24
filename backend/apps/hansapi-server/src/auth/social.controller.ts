import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  Auth,
  AuthType,
  CurrentUser,
  FirstPartyOnly,
  Public,
  SocialAuthGuard,
  SocialService,
  toOAuthProvider,
} from '@hansapi/auth-application';
import type {
  AuthUser,
  CallbackOutcome,
  SocialProfile,
} from '@hansapi/auth-application';

import { TokenResponseDto } from './dto/auth.dto';
import {
  LinkPrepareResponseDto,
  SocialRegisterRequestDto,
} from './dto/social.dto';
import { requestMeta, respondTokens } from './refresh-cookie';

/**
 * 소셜 로그인(인증) 엔드포인트. 백엔드가 provider 콜백을 받아 처리한 뒤,
 * 결과(인가코드/가입티켓/연동/에러)를 프론트(SPA)로 리다이렉트한다.
 * 최종 로그인 토큰 교환은 /oauth/token 이 담당한다.
 */
@ApiTags('auth-social')
@Controller('auth')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post('social/register')
  @Public()
  @FirstPartyOnly()
  @HttpCode(200)
  @ApiOperation({
    summary: '소셜 신규 가입 확정',
    description:
      '콜백에서 받은 가입 티켓으로 계정을 만든다. provider 가 이메일을 주지 않은 경우 email 을 함께 보낸다. 성공 시 로그인 토큰을 발급한다.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  async register(
    @Body() dto: SocialRegisterRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.social.register(
      { ticket: dto.ticket, email: dto.email },
      requestMeta(req),
    );
    return respondTokens(res, result.tokens);
  }

  @Post('social/link/prepare')
  @Auth(AuthType.Jwt)
  @ApiOperation({
    summary: '소셜 연동 시작 토큰 발급',
    description:
      '로그인 상태에서 연동 시작 토큰을 받는다. 이후 GET /auth/:provider?link_token=<토큰> 으로 이동하면 현재 계정에 연동된다.',
  })
  @ApiOkResponse({ type: LinkPrepareResponseDto })
  prepareLink(@CurrentUser() user: AuthUser): LinkPrepareResponseDto {
    return { linkToken: this.social.prepareLink(user.userId) };
  }

  @Get(':provider')
  @Public()
  @UseGuards(SocialAuthGuard)
  @ApiOperation({
    summary: '소셜 로그인 시작',
    description:
      'provider 인가 페이지로 리다이렉트한다. link_token 쿼리가 있으면 현재 계정 연동 의도로 시작한다. provider: google|naver|kakao|line',
  })
  start(): void {
    // 리다이렉트는 SocialAuthGuard(passport)가 처리한다. 여기 도달하지 않는다.
  }

  @Get(':provider/callback')
  @Public()
  @UseGuards(SocialAuthGuard)
  @ApiExcludeEndpoint()
  async callback(
    @Req() req: Request & { user?: SocialProfile },
    @Res() res: Response,
  ): Promise<void> {
    const profile = req.user;
    if (!profile) {
      throw new BadRequestException('소셜 프로필을 확인할 수 없습니다.');
    }
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const { outcome, returnTo } = await this.social.handleCallback(
      profile,
      state,
      requestMeta(req),
    );
    res.redirect(this.buildRedirect(returnTo, outcome));
  }

  @Delete(':provider/link')
  @Auth(AuthType.Jwt)
  @HttpCode(204)
  @ApiOperation({
    summary: '소셜 연동 해제',
    description:
      '현재 계정에서 해당 provider 연동을 제거한다. 마지막 로그인 수단(비밀번호도 없고 연동 하나뿐)이면 거부한다.',
  })
  async unlink(
    @CurrentUser() user: AuthUser,
    @Param('provider') providerParam: string,
    @Req() req: Request,
  ): Promise<void> {
    const provider = toOAuthProvider(providerParam);
    if (!provider) {
      throw new BadRequestException('지원하지 않는 소셜 provider 입니다.');
    }
    await this.social.unlink(user.userId, provider, requestMeta(req));
  }

  /** 콜백 결과를 프론트 복귀 URL(returnTo)에 실어 리다이렉트 대상으로 변환한다. */
  private buildRedirect(
    returnTo: string | undefined,
    outcome: CallbackOutcome,
  ): string {
    if (!returnTo) {
      throw new BadRequestException(
        '복귀 URL(return_to)이 없습니다. 로그인 시작 시 return_to 를 전달하세요.',
      );
    }
    const url = new URL(returnTo);
    switch (outcome.kind) {
      case 'code':
        url.searchParams.set('code', outcome.code);
        break;
      case 'pending':
        url.searchParams.set('pending', outcome.ticket);
        if (outcome.emailRequired) {
          url.searchParams.set('email_required', '1');
        }
        break;
      case 'linked':
        url.searchParams.set('linked', '1');
        break;
      case 'error':
        url.searchParams.set('error', outcome.error);
        break;
    }
    return url.toString();
  }
}
