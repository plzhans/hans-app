import {
  Inject,
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
} from '@hansapp/auth-application';
import type {
  AuthUser,
  CallbackOutcome,
  SocialProfile,
} from '@hansapp/auth-application';
import type { SupportedLang } from '@hansapp/common';
import { AUTH_CONFIG } from '@hansapp/auth-application';
import type { AuthConfig } from '@hansapp/auth-application';

import { Lang } from '../common/lang.decorator';

import { TokenResponseDto } from './dto/auth.dto';
import {
  LinkPrepareResponseDto,
  SocialRegisterCodeRequestDto,
  SocialRegisterRequestDto,
} from './dto/social.dto';
import { requestMeta, respondTokens, setLoginCookies } from './refresh-cookie';

/**
 * 소셜 로그인(인증) 엔드포인트. 백엔드가 provider 콜백을 받아 처리한 뒤,
 * 결과(인가코드/가입티켓/연동/에러)를 프론트(SPA)로 리다이렉트한다.
 * 최종 로그인 토큰 교환은 /oauth/token 이 담당한다.
 */
@ApiTags('auth-social')
@Controller('auth')
export class SocialController {
  constructor(
    private readonly social: SocialService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  /** return_to 없이 끝난 로그인이 도착할 자리(인증웹 로그인 URL). 없으면 거부한다. */
  private get authorizeUrl(): string | undefined {
    return this.authConfig.authorizeUrl;
  }

  @Post('social/register/request-code')
  @Public()
  @FirstPartyOnly()
  @HttpCode(202)
  @ApiOperation({
    summary: '소셜 가입 인증 코드 발송',
    description:
      'provider 가 이메일을 검증하지 않은 경우(콜백 code_required) 가입 이메일로 코드를 보낸다. provider 가 이메일을 안 준 경우 email 을 함께 보낸다.',
  })
  async requestRegisterCode(
    @Body() dto: SocialRegisterCodeRequestDto,
    @Lang() lang: SupportedLang,
  ): Promise<void> {
    await this.social.requestRegisterCode(dto.ticket, dto.email, lang);
  }

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
      { ticket: dto.ticket, email: dto.email, code: dto.code },
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
      throw new BadRequestException('Social profile is unavailable.');
    }
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const { outcome, returnTo, clientState, clientId } =
      await this.social.handleCallback(profile, state, requestMeta(req));
    // **자사 로그인은 여기서 끝난다.** 쿠키를 심고 원래 있던 자리로 돌려보낸다 —
    // 인가코드를 만들어 프론트가 교환하게 하는 왕복이 없다.
    if (outcome.kind === 'session') {
      setLoginCookies(res, outcome.tokens);
    }
    res.redirect(this.buildRedirect(clientId, returnTo, outcome, clientState));
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
      throw new BadRequestException('Unsupported social provider.');
    }
    await this.social.unlink(user.userId, provider, requestMeta(req));
  }

  /**
   * 자사 로그인이 끝났는데 돌아갈 곳이 없을 때 내려놓을 자리.
   *
   * **session 은 /me 로 직행한다.** 예전엔 authorizeUrl(로그인 페이지)로 보냈는데, 이미
   * 로그인한 사용자가 로그인 화면을 찍고 다시 /me 로 튕기는 홉이 하나 더 있었다.
   * pending 은 가입을 이어갈 화면이 콜백에 있으므로 그쪽으로 보낸다.
   *
   * webUrl 이 없으면(설정 누락) null 을 돌려 예전 동작으로 물러난다.
   */
  private landingUrl(outcome: CallbackOutcome): string | null {
    const base = this.authConfig.externalUrl;
    if (!base) return this.authorizeUrl ?? null;
    if (outcome.kind === 'session') return `${base}/me`;
    return this.withOutcome(new URL(`${base}/callback`), outcome).toString();
  }

  /**
   * 콜백 결과를 실제 리다이렉트 대상으로 바꾼다.
   *
   * **1차 기준은 clientId 다 — 없으면 자사(1st-party).**
   * 자사는 인증웹이 우리 것이라 돌아갈 곳을 못 받아도 보낼 데가 있다(/me·/callback).
   * 외부 앱은 등록된 redirect_uri 말고는 보낼 데가 없으므로 returnTo 가 필수다.
   * 그래서 "returnTo 가 필수인가" 는 clientId 에서 따라 나오지, 별개 조건이 아니다.
   */
  private buildRedirect(
    clientId: string | undefined,
    returnTo: string | undefined,
    outcome: CallbackOutcome,
    clientState?: string,
  ): string {
    // 자사인데 돌아갈 곳이 없다 = 인증웹에 직접 와서 로그인한 경우. 우리가 내려놓는다.
    if (!clientId && !returnTo) {
      const landing = this.landingUrl(outcome);
      if (landing) return landing;
    }
    if (!returnTo) {
      throw new BadRequestException(
        'Missing return_to. Provide return_to when starting sign-in.',
      );
    }
    const url = new URL(returnTo);
    // 클라이언트가 보낸 state 를 그대로 반환한다(RFC 6749 §4.1.2). 그 앱이 CSRF 대조와
    // PKCE verifier 조회 키로 쓰므로, 없으면 교환 자체를 못 한다.
    if (clientState) {
      url.searchParams.set('state', clientState);
    }
    return this.withOutcome(url, outcome).toString();
  }

  /** 결과를 쿼리로 실어 준다. 자사 착지점과 외부 복귀가 같은 규칙을 쓴다. */
  private withOutcome(url: URL, outcome: CallbackOutcome): URL {
    switch (outcome.kind) {
      // 세션은 쿠키로 이미 전달됐다. URL 에 실을 것이 없다 —
      // 도착한 앱이 그 쿠키로 refresh 를 불러 access token 을 채운다.
      case 'session':
        break;
      case 'code':
        url.searchParams.set('code', outcome.code);
        break;
      case 'pending':
        url.searchParams.set('pending', outcome.ticket);
        if (outcome.emailRequired) {
          url.searchParams.set('email_required', '1');
        }
        if (outcome.codeRequired) {
          url.searchParams.set('code_required', '1');
        }
        if (outcome.email) {
          url.searchParams.set('email', outcome.email);
        }
        break;
      case 'linked':
        url.searchParams.set('linked', '1');
        break;
      case 'error':
        url.searchParams.set('error', outcome.error);
        break;
    }
    return url;
  }
}
