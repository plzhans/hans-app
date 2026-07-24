import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { AppStatus } from '@hansapi/data';
import type { Request } from 'express';

import { AccessCache } from '../app/access-cache.service';
import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { SocialTicketService } from './social-ticket.service';
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
@Injectable()
export class SocialAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly tickets: SocialTicketService,
    private readonly access: AccessCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawParam = req.params.provider;
    const providerParam = Array.isArray(rawParam) ? rawParam[0] : rawParam;
    const provider = toOAuthProvider(providerParam ?? '');
    if (!provider) {
      throw new BadRequestException('Unsupported social provider.');
    }
    const key = toStrategyName(provider) as
      'google' | 'naver' | 'kakao' | 'line';
    if (!this.config.oauth[key]) {
      throw new NotFoundException(`Social provider is not configured: ${key}`);
    }

    const state = await this.buildState(req);
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
    const BaseGuard = PassportAuthGuard(key);
    const guard = new (class extends BaseGuard {
      getAuthenticateOptions() {
        return { state, session: false, callbackURL, ...extra };
      }
    })();

    const result = await guard.canActivate(context);
    return result as boolean;
  }

  /**
   * 시작 요청에서 state 를 만든다. 콜백에서는 이 함수가 다시 불려도 값이 쓰이지 않는다
   * (콜백엔 link_token·return_to 쿼리가 없다).
   *  - link_token: 연동 의도(현재 로그인 사용자에 연동)
   *  - return_to: 로그인 성공 후 백엔드가 코드를 실어 돌려보낼 프론트 URL(허용목록 검증)
   */
  private async buildState(req: Request): Promise<string> {
    const linkToken =
      typeof req.query.link_token === 'string'
        ? req.query.link_token
        : undefined;
    const { returnTo, clientId } = await this.resolveReturnTo(req);

    if (linkToken) {
      // 연동은 인가코드를 만들지 않으므로 PKCE 대상이 아니다.
      const { userId } = this.tickets.verifyLinkPrepare(linkToken);
      return this.tickets.signState({
        intent: 'link',
        userId,
        returnTo,
        clientId,
      });
    }

    // 로그인은 끝에서 인가코드가 나오므로 challenge 가 있어야 한다.
    // 여기서 안 받으면 콜백에서 코드를 만들 때 붙일 값이 없다(그 요청엔 쿼리가 없다).
    const codeChallenge =
      typeof req.query.code_challenge === 'string'
        ? req.query.code_challenge
        : undefined;
    if (returnTo && !codeChallenge) {
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
    return this.tickets.signState({
      intent: 'login',
      returnTo,
      clientId,
      codeChallenge,
      clientState,
    });
  }

  /**
   * return_to 를 검증하고, 어느 클라이언트의 복귀인지 함께 확정한다.
   *
   * client_id 가 오면 **그 클라이언트에 등록된 리디렉션 URI 와 정확히 일치**해야 한다.
   * 없으면 1st-party(인증 포털 자신)로 보고 전역 허용목록을 본다 — 포털은 클라이언트로 등록하지 않는다.
   *
   * 여기서 정한 clientId 가 state 에 실려 콜백까지 가고, 발급되는 인가코드에 박힌다.
   * 그래야 토큰 교환 때 "이 코드는 누구 것"을 서버가 알 수 있다.
   */
  private async resolveReturnTo(
    req: Request,
  ): Promise<{ returnTo?: string; clientId?: string }> {
    const raw =
      typeof req.query.return_to === 'string' ? req.query.return_to : undefined;
    if (!raw) return {};

    let origin: string;
    try {
      origin = new URL(raw).origin;
    } catch {
      throw new BadRequestException('Malformed return_to.');
    }

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
          'return_to is not a registered redirect URI.',
        );
      }
      return { returnTo: raw, clientId: client.clientId };
    }

    if (!this.config.allowedOrigins.includes(origin)) {
      throw new BadRequestException('return_to not allowed.');
    }
    return { returnTo: raw };
  }
}
