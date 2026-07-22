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
import { toOAuthProvider, toStrategyName } from './social.types';

/**
 * :provider 파라미터로 알맞은 passport 소셜 전략을 골라 실행하는 동적 가드.
 * - 시작(GET /auth/:provider): provider 인가 페이지로 리다이렉트. link_token 이 있으면 연동 의도로 state 를 싣는다.
 * - 콜백(GET /auth/:provider/callback): 인가코드를 교환하고 req.user 에 SocialProfile 을 채운다.
 *
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
      throw new BadRequestException('지원하지 않는 소셜 provider 입니다.');
    }
    const key = toStrategyName(provider) as
      'google' | 'naver' | 'kakao' | 'line';
    if (!this.config.oauth[key]) {
      throw new NotFoundException(
        `소셜 provider(${key})가 설정되지 않았습니다.`,
      );
    }

    const state = this.buildState(req);
    const BaseGuard = PassportAuthGuard(key);
    const guard = new (class extends BaseGuard {
      getAuthenticateOptions() {
        return { state, session: false };
      }
    })();

    const result = await guard.canActivate(context);
    return result as boolean;
  }

  /** 시작 요청에서 state 를 만든다. link_token 이 있으면 연동 의도. 콜백에서는 사용되지 않는다. */
  private buildState(req: Request): string {
    const linkToken =
      typeof req.query.link_token === 'string'
        ? req.query.link_token
        : undefined;
    if (linkToken) {
      const { userId } = this.tickets.verifyLinkPrepare(linkToken);
      return this.tickets.signState({ intent: 'link', userId });
    }
    return this.tickets.signState({ intent: 'login' });
  }
}
