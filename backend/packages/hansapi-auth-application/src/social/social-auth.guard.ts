import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

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

    const state = this.buildState(req);
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
  private buildState(req: Request): string {
    const linkToken =
      typeof req.query.link_token === 'string'
        ? req.query.link_token
        : undefined;
    const returnTo = this.resolveReturnTo(req);

    if (linkToken) {
      const { userId } = this.tickets.verifyLinkPrepare(linkToken);
      return this.tickets.signState({ intent: 'link', userId, returnTo });
    }
    return this.tickets.signState({ intent: 'login', returnTo });
  }

  /** 클라이언트가 넘긴 return_to 를 허용목록(오리진)으로 검증한다. 없거나 불허면 undefined. */
  private resolveReturnTo(req: Request): string | undefined {
    const raw =
      typeof req.query.return_to === 'string' ? req.query.return_to : undefined;
    if (!raw) return undefined;
    let origin: string;
    try {
      origin = new URL(raw).origin;
    } catch {
      throw new BadRequestException('Malformed return_to.');
    }
    if (!this.config.allowedOrigins.includes(origin)) {
      throw new BadRequestException('return_to not allowed.');
    }
    return raw;
  }
}
