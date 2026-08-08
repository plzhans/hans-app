import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import passport from 'passport';
import { AppStatus } from '@hansapp/data';
import type { Request, Response } from 'express';

import { AccessCache } from '../app/access-cache.service';
import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { isFirstPartyOrigin } from '../first-party-origin';
import { SocialTicketService } from './social-ticket.service';
import {
  SocialStrategyFactory,
  type RequestStrategy,
  type SocialKey,
} from './social-strategy.factory';
import { externalBaseUrl } from './request-url';
import { toOAuthProvider, toStrategyName } from './social.types';

/**
 * :provider 파라미터로 알맞은 passport 소셜 전략을 골라 실행하는 동적 가드.
 * - 시작(GET /auth/:provider): provider 인가 페이지로 리다이렉트. link_token 이 있으면 연동 의도로 state 를 싣는다.
 * - 콜백(GET /auth/:provider/callback): 인가코드를 교환하고 req.user 에 SocialProfile 을 채운다.
 *
 * redirect_uri(callbackURL)는 **요청이 들어온 호스트에서 그대로 만든다** — 별도 env(base URL)를 두지 않는다.
 * 시작·콜백이 같은 도메인으로 오므로 두 번 다 동일한 redirect_uri 가 만들어져 provider 검증과 일치한다.
 * OAuth state 는 세션 없이 서명 토큰으로 운반한다(SocialTicketService). session:false 로 서버세션도 안 쓴다.
 */
/**
 * 흐름 소유권 확인용 쿠키의 이름 접두사. 뒤에 flowId 가 붙어 흐름마다 이름이 갈린다
 * (동시 로그인 지원). path 를 /auth 로 좁혀 다른 요청에 실려 다니지 않게 한다.
 */
const FLOW_COOKIE_PREFIX = 'oauth_flow_';

/**
 * 콜백 요청인지 본다. 같은 가드가 시작(:provider)과 콜백(:provider/callback) 양쪽에 걸려
 * 있어서, 무엇을 할지 여기서 가른다.
 */
function isCallbackRequest(req: Request): boolean {
  return /\/callback\/?$/.test(req.path);
}

/**
 * passport 가 넘기는 오류를 Error 로 맞춘다. **원본을 감싸지 않고 그대로 통과시킨다** —
 * HttpException 도 여기로 오는데 감싸면 상태코드를 잃는다.
 */
function toError(raw: unknown): Error {
  return raw instanceof Error ? raw : new Error(String(raw));
}

@Injectable()
export class SocialAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly tickets: SocialTicketService,
    private readonly access: AccessCache,
    private readonly strategies: SocialStrategyFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawParam = req.params.provider;
    const providerParam = Array.isArray(rawParam) ? rawParam[0] : rawParam;
    const provider = toOAuthProvider(providerParam ?? '');
    if (!provider) {
      throw new BadRequestException('Unsupported social provider.');
    }
    const key = toStrategyName(provider) as SocialKey;

    // **콜백이면 먼저 흐름 소유권을 확인한다.** provider 와 코드를 교환하기 전에 막아야
    // 남의 흐름으로 계정이 만들어지거나 연동되는 부수효과가 생기지 않는다.
    if (isCallbackRequest(req)) {
      this.assertFlowOwnership(context);
      // 콜백에는 return_to·link_token 쿼리가 없어 여기서 만든 state 는 쓰이지 않는다.
      // passport 가 쿼리의 state 를 그대로 검증에 쓴다.
    }

    const state = await this.buildState(req, context);
    // redirect_uri 를 요청 호스트에서 조립한다: {scheme}://{host}/auth/:provider/callback
    const callbackURL = `${externalBaseUrl(req)}/auth/${key}/callback`;
    // provider 별 인가 파라미터. 기본은 세션이 있으면 계정 선택 없이 자동 로그인되므로,
    // **매번 계정 선택/재로그인 화면**을 강제한다.
    //  - google: prompt=select_account (계정 선택 화면)
    //  - naver:  auth_type=reprompt   (이미 로그인돼 있어도 로그인·동의 화면 재노출) → passport-naver-v2 가 authType 을 auth_type 으로 전달
    const extra =
      key === 'google'
        ? { prompt: 'select_account' }
        : key === 'naver'
          ? { authType: 'reprompt' }
          : {};
    /*
      **전략을 요청마다 만들어 넘긴다.** 자격증명이 DB(env_setting)에 있어 부팅 때
      passport.use() 로 등록해 둘 수가 없다 — 등록해 두면 화면에서 Client Secret 을 바꿔도
      재시작 전까지 옛 값으로 인가 요청이 나간다.

      설정 안 된 provider 면 팩토리가 404 를 던진다(예전 config.oauth[key] 판정과 같은 응답).
    */
    const strategy = await this.strategies.create(key, callbackURL);
    return this.run(strategy, context, { state, session: false, ...extra });
  }

  /**
   * passport 를 직접 돌린다.
   *
   * **두 갈래로 끝난다.**
   *  - 시작 요청: passport 가 provider 로 리다이렉트한다. 응답이 이미 나갔으므로 여기서
   *    돌려줄 값이 없다 — 콜백도 next 도 불리지 않는다(@nestjs/passport 도 같게 동작한다).
   *  - 콜백 요청: verify 가 끝나 user 가 오면 req.user 에 담고 true 를 돌려준다.
   */
  private run(
    strategy: RequestStrategy,
    context: ExecutionContext,
    options: Record<string, unknown>,
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return new Promise<boolean>((resolve, reject) => {
      const handler = passport.authenticate(
        strategy as never,
        options,
        (err: unknown, user: unknown) => {
          if (err) return reject(toError(err));
          if (!user) {
            return reject(new UnauthorizedException('Social sign-in failed.'));
          }
          (req as Request & { user?: unknown }).user = user;
          resolve(true);
        },
      ) as (req: Request, res: Response, next: (e?: unknown) => void) => void;

      handler(req, res, (e?: unknown) => {
        if (e) reject(toError(e));
      });
    });
  }

  /**
   * 시작 요청에서 state 를 만든다. 콜백에서는 이 함수가 다시 불려도 값이 쓰이지 않는다
   * (콜백엔 link_token·return_to 쿼리가 없다).
   *  - link_token: 연동 의도(현재 로그인 사용자에 연동)
   *  - return_to: 로그인 성공 후 백엔드가 코드를 실어 돌려보낼 프론트 URL(허용목록 검증)
   */
  private async buildState(
    req: Request,
    context: ExecutionContext,
  ): Promise<string> {
    const linkToken =
      typeof req.query.link_token === 'string'
        ? req.query.link_token
        : undefined;
    const { returnTo, clientId } = await this.resolveReturnTo(req);

    if (linkToken) {
      // 연동은 인가코드를 만들지 않으므로 PKCE 대상이 아니다.
      const { userId } = this.tickets.verifyLinkPrepare(linkToken);
      // 연동도 같은 공격이 성립한다 — 남의 계정에 공격자의 소셜을 붙일 수 있다.
      const { flowId, nonce } = this.issueFlowNonce(context);
      return this.tickets.signState({
        intent: 'link',
        userId,
        returnTo,
        clientId,
        flowId,
        nonce,
      });
    }

    // 로그인은 끝에서 인가코드가 나오므로 challenge 가 있어야 한다.
    // 여기서 안 받으면 콜백에서 코드를 만들 때 붙일 값이 없다(그 요청엔 쿼리가 없다).
    const codeChallenge =
      typeof req.query.code_challenge === 'string'
        ? req.query.code_challenge
        : undefined;
    // **외부 앱만 PKCE 를 요구한다.** 그쪽은 인가코드를 받아 교환하는데 client_secret 을
    // 숨길 수 없어서 verifier 로 대신 증명해야 한다.
    //
    // 자사는 코드를 만들지 않고 콜백에서 쿠키를 심는다 — 훔칠 코드가 없으니 PKCE 가 막을
    // 대상도 없다. 대신 흐름을 브라우저에 묶는 일(로그인 CSRF 방어)은 state nonce 가 맡는다.
    if (clientId && !codeChallenge) {
      throw new BadRequestException('code_challenge is required (PKCE, S256).');
    }
    // 클라이언트의 state 는 우리가 해석하지 않는다. 최종 리다이렉트에 그대로 돌려주기 위해
    // 왕복시킬 뿐이다. 크기를 남이 정하므로 상한을 둔다 — 안 두면 우리 state·URL 이 같이 부푼다.
    const clientState =
      typeof req.query.client_state === 'string'
        ? req.query.client_state
        : undefined;
    if (clientState && clientState.length > 512) {
      throw new BadRequestException('client_state is too long (max 512).');
    }
    // **"로그인 상태 유지" 는 여기서만 받을 수 있다.** provider 로 떠나면 원래 요청이 끊기고,
    // 돌아오는 콜백에는 우리 쿼리가 하나도 남지 않는다 — 지금 state 에 실어야 콜백까지 간다.
    //
    // 기본은 꺼짐이다. 값이 없으면 안 켠 것으로 본다 — 화면과 같은 기준이어야 하고,
    // 공용 PC 에서 실수로 남는 쪽보다 원하는 사람이 한 번 더 누르는 쪽이 낫다.
    const persistent = req.query.remember === '1';
    // **흐름을 이 브라우저에 묶는다.** nonce 를 쿠키로도 심어 콜백에서 대조한다.
    const { flowId, nonce } = this.issueFlowNonce(context);
    return this.tickets.signState({
      intent: 'login',
      returnTo,
      clientId,
      codeChallenge,
      clientState,
      flowId,
      nonce,
      persistent,
    });
  }

  /**
   * return_to 를 검증하고, 어느 클라이언트의 복귀인지 함께 확정한다.
   *
   * client_id 가 오면 **그 클라이언트에 등록된 리디렉션 URI 와 정확히 일치**해야 한다.
   * 없으면 1st-party(인증웹 자신)로 보고 전역 허용목록을 본다 — 인증웹은 클라이언트로 등록하지 않는다.
   *
   * 여기서 정한 clientId 가 state 에 실려 콜백까지 가고, 발급되는 인가코드에 박힌다.
   * 그래야 토큰 교환 때 "이 코드는 누구 것"을 서버가 알 수 있다.
   */
  private async resolveReturnTo(
    req: Request,
  ): Promise<{ returnTo?: string; clientId?: string }> {
    const raw =
      typeof req.query.redirect_uri === 'string'
        ? req.query.redirect_uri
        : undefined;
    if (!raw) return {};

    const clientId =
      typeof req.query.client_id === 'string' ? req.query.client_id : undefined;

    if (clientId) {
      const client = await this.access.getClient(clientId);
      if (!client || client.status !== AppStatus.ACTIVE) {
        throw new BadRequestException('Unknown client.');
      }
      const allowed = (client.redirectUris as string[] | null) ?? [];
      if (!allowed.includes(raw)) {
        throw new BadRequestException(
          'redirect_uri is not a registered redirect URI.',
        );
      }
      return { returnTo: raw, clientId: client.clientId };
    }

    // 1st-party(client_id 없음): redirect_uri 가 서비스 루트 도메인(APP_ROOT_DOMAIN) 범위여야 한다
    // = SSO 쿠키 공유 범위와 일치. 그 밖으로는 코드/세션을 실어 리다이렉트하지 않는다(오픈 리다이렉트 방지).
    if (!isFirstPartyOrigin(raw, this.config.rootDomain)) {
      throw new BadRequestException('redirect_uri not allowed.');
    }
    return { returnTo: raw };
  }

  /**
   * 흐름을 시작한 브라우저에 nonce 를 심고, state 에 실을 짝을 돌려준다.
   *
   * 쿠키 이름을 flowId 로 가르는 이유는 **동시 로그인** 때문이다. 이름이 하나면 탭 두 개로
   * 동시에 시작했을 때 나중 것이 앞 것을 덮어써, 앞 탭이 콜백에서 대조에 실패한다.
   *
   * SameSite 는 lax 여야 한다 — provider 에서 돌아오는 것은 크로스사이트 top-level GET
   * 리다이렉트라 strict 면 쿠키가 안 실려 온다. httpOnly 로 JS 접근을 막는다(서버만 읽는다).
   */
  private issueFlowNonce(context: ExecutionContext): {
    flowId: string;
    nonce: string;
  } {
    const res = context.switchToHttp().getResponse<Response>();
    const flowId = randomBytes(8).toString('hex');
    const nonce = randomBytes(32).toString('base64url');
    res.cookie(`${FLOW_COOKIE_PREFIX}${flowId}`, nonce, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/auth',
      maxAge: this.config.socialFlowTtlSec * 1000,
    });
    return { flowId, nonce };
  }

  /**
   * 콜백이 **이 흐름을 시작한 브라우저**에서 왔는지 확인한다.
   *
   * 이것이 없으면 공격자가 자기 계정으로 인가를 마친 콜백 URL 을 피해자에게 보내
   * 피해자를 공격자 계정으로 로그인시킬 수 있다(로그인 CSRF). state 는 서명만 검증하므로
   * 공격자가 정상 발급받은 값도 통과한다 — 쿠키만이 브라우저를 가른다.
   *
   * 확인이 끝나면 쿠키를 지운다. 일회용이라 남겨 둘 이유가 없고, 재사용도 막는다.
   */
  private assertFlowOwnership(context: ExecutionContext): void {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const raw = typeof req.query.state === 'string' ? req.query.state : '';
    if (!raw) {
      throw new BadRequestException('Missing state.');
    }
    // 서명·유효기간이 먼저다. 위조된 state 의 flow_id 로 쿠키를 뒤질 이유가 없다.
    const { flowId, nonce } = this.tickets.verifyState(raw);
    if (!flowId || !nonce) {
      // 이 배포 이전에 시작된 흐름. 새로 로그인하면 정상 값이 담긴다.
      throw new BadRequestException('Stale sign-in flow. Please try again.');
    }
    const name = `${FLOW_COOKIE_PREFIX}${flowId}`;
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const seen = cookies[name];
    res.clearCookie(name, { path: '/auth' });
    // 길이가 같을 때만 timingSafeEqual 을 쓸 수 있다. 다르면 그 자체로 불일치다.
    const a = Buffer.from(seen ?? '');
    const b = Buffer.from(nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException(
        'Sign-in flow does not belong to this browser.',
      );
    }
  }
}
