import {
  Inject,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  FirstPartyOnly,
  Public,
  SocialAuthGuard,
  SocialService,
} from '@hansapp/auth-application';
import type { CallbackOutcome, SocialProfile } from '@hansapp/auth-application';
import type { SupportedLang } from '@hansapp/common';
import { AUTH_CONFIG } from '@hansapp/auth-application';
import type { AuthConfig } from '@hansapp/auth-application';

import { Lang } from '../common/lang.decorator';

import { TokenResponseDto } from './dto/auth.dto';
import {
  SocialRegisterCodeRequestDto,
  SocialRegisterRequestDto,
} from './dto/social.dto';
import { requestMeta, respondTokens, setLoginCookies } from './refresh-cookie';

/**
 * 소셜 로그인(인증) 엔드포인트. 백엔드가 provider 콜백을 받아 처리한 뒤,
 * 결과(인가코드/가입티켓/연동/에러)를 프론트(SPA)로 리다이렉트한다.
 * 최종 로그인 토큰 교환은 /oauth/token 이 담당한다.
 *
 * **스펙에 싣지 않는다(@ApiExcludeController).** 리다이렉트 둘은 애초에 API 가 아니고
 * (302 라 fetch 로 부를 수 없다), 가입 확정 둘은 콜백이 돌려준 티켓을 우리 인증웹이 쓰는
 * 자리다. 외부 앱은 이 왕복을 몰라도 된다 — `/oauth/authorize` 로 시작하면 우리가 대신 돈다.
 */
@ApiExcludeController()
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
    @Lang() lang: SupportedLang,
  ): Promise<TokenResponseDto> {
    const result = await this.social.register(
      {
        ticket: dto.ticket,
        email: dto.email,
        code: dto.code,
        consent: dto.consent,
      },
      requestMeta(req),
      lang,
    );
    return respondTokens(res, result.tokens);
  }

  /**
   * 소셜 로그인 시작. 브라우저를 provider 인가 페이지로 302 시킨다.
   * `link_token` 쿼리가 있으면 로그인이 아니라 현재 계정에 연동하는 의도로 시작한다.
   *
   * **애초에 API 가 아니다.** 브라우저 내비게이션이라 `fetch` 로 부르면 CORS 에 막히고,
   * 통과해도 provider 의 로그인 HTML 을 받을 뿐이다. 실제 사용법은 `location.href = ...` 뿐이다.
   * 스펙에 실려 있던 동안 orval 이 이걸로 `useSocialControllerStart()` 훅을 만들어 놨었다 —
   * 부르면 안 되는 훅이다. (컨트롤러째 제외되어 지금은 스펙에 없다.)
   */
  @Get(':provider')
  @Public()
  @UseGuards(SocialAuthGuard)
  start(): void {
    // 리다이렉트는 SocialAuthGuard(passport)가 처리한다. 여기 도달하지 않는다.
  }

  @Get(':provider/callback')
  @Public()
  @UseGuards(SocialAuthGuard)
  async callback(
    @Req() req: Request & { user?: SocialProfile },
    @Res() res: Response,
    @Lang() lang: SupportedLang,
  ): Promise<void> {
    const profile = req.user;
    if (!profile) {
      throw new BadRequestException('Social profile is unavailable.');
    }
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const { outcome, returnTo, clientState, clientId } =
      await this.social.handleCallback(profile, state, requestMeta(req), lang);
    // **자사 로그인은 여기서 끝난다.** 쿠키를 심고 원래 있던 자리로 돌려보낸다 —
    // 인가코드를 만들어 프론트가 교환하게 하는 왕복이 없다.
    if (outcome.kind === 'session') {
      setLoginCookies(res, outcome.tokens);
    }
    res.redirect(this.buildRedirect(clientId, returnTo, outcome, clientState));
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
   * 자사 흐름이 실패했을 때 내려놓을 자리(인증웹 콜백).
   *
   * 원래 가려던 곳을 `ret` 으로 함께 싣는다 — 사용자가 사유를 읽고 이메일로 로그인하면
   * 거기서 이어 갈 수 있어야 한다. 값은 이미 서명 state 로 왕복하며 오리진이 검증된 것이라
   * 여기서 다시 열어 볼 것이 없다.
   *
   * 인증웹 주소를 모르면(설정 누락) null 을 돌려 예전 동작으로 물러난다 — 보낼 데가 없는데
   * 실패까지 삼키면 사용자는 빈 화면만 본다.
   */
  private errorLandingUrl(
    outcome: CallbackOutcome,
    returnTo: string | undefined,
  ): string | null {
    const base = this.authConfig.externalUrl;
    if (!base) return null;
    const url = this.withOutcome(new URL(`${base}/callback`), outcome);
    if (returnTo) url.searchParams.set('ret', returnTo);
    return url.toString();
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
    /*
      **실패는 자사 앱으로 돌려보내지 않는다.**

      돌려보내면 포털이 `?error=email_exists` 를 달고 열린다 — 그 화면에는 이 값을 읽는
      코드도, 사용자가 다음에 무엇을 해야 하는지 말해 줄 자리도 없다. 로그인하려던 사람이
      아무 설명 없는 원래 화면으로 튕겨 나오는 셈이다.

      사유 문구와 다음 행동(이메일로 로그인 → 마이페이지에서 연동)을 아는 화면은 인증웹의
      콜백 하나뿐이므로, 실패는 거기로 내려놓는다. 원래 가려던 곳은 ret 으로 실어 보내
      사용자가 문제를 풀고 나면 이어서 갈 수 있게 한다.

      **외부 앱(clientId)은 예외다.** OAuth 는 실패도 redirect_uri 로 돌려주게 돼 있고
      (RFC 6749 §4.1.2.1), 그 앱들은 그렇게 받도록 만들어져 있다. 여기서 규약을 어기면
      그 앱은 사용자가 어디로 사라졌는지 알 수 없다.
    */
    if (outcome.kind === 'error' && !clientId) {
      const landing = this.errorLandingUrl(outcome, returnTo);
      if (landing) return landing;
    }
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

  /**
   * 결과를 URL 에 실어 준다. 자사 착지점과 외부 복귀가 같은 규칙을 쓴다.
   *
   * **개인정보를 담은 값은 fragment(#) 로 보낸다.** fragment 는 브라우저가 서버로 보내지
   * 않으므로 접속 로그·Referer 헤더·오류 추적에 남지 않는다. 여기 해당하는 것은 둘이다 —
   * 이메일 평문, 그리고 프로필(이메일·이름)이 담긴 pending 티켓(JWT 는 서명일 뿐 암호화가
   * 아니라 누구나 디코드해 읽는다).
   *
   * **code 와 state 는 쿼리에 그대로 둔다.** 외부 앱이 읽는 OAuth 규약(RFC 6749 §4.1.2)이라
   * 옮기면 그 앱들의 SDK 가 깨진다. 30초 1회용이라 남아도 재사용 가치가 없기도 하다.
   * email_required·code_required·linked·error 도 개인정보가 아니라 쿼리에 둔다.
   */
  private withOutcome(url: URL, outcome: CallbackOutcome): URL {
    switch (outcome.kind) {
      // 세션은 쿠키로 이미 전달됐다. URL 에 실을 것이 없다 —
      // 도착한 앱이 그 쿠키로 refresh 를 불러 access token 을 채운다.
      case 'session':
        break;
      case 'code':
        url.searchParams.set('code', outcome.code);
        break;
      case 'pending': {
        const secret = new URLSearchParams({ pending: outcome.ticket });
        if (outcome.email) {
          secret.set('email', outcome.email);
        }
        url.hash = secret.toString();
        if (outcome.emailRequired) {
          url.searchParams.set('email_required', '1');
        }
        if (outcome.codeRequired) {
          url.searchParams.set('code_required', '1');
        }
        break;
      }
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
