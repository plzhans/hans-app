import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { AuthErrorCode } from '../error';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@hansapp/common';
import type { Request } from 'express';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { isFirstPartyOrigin } from '../first-party-origin';
import { FIRST_PARTY_ONLY_KEY } from './first-party.decorator';

/**
 * @FirstPartyOnly() 라우트의 **Origin 검사** 가드. 인증(AuthGuard)과 별개 축이다.
 *
 * CORS 를 느슨하게(요청 오리진 반사) 두었으므로, 쿠키를 다루는 라우트는 스스로 오리진을 봐야 한다.
 * Origin 은 브라우저가 강제로 채우고 스크립트가 못 바꾸므로 신뢰할 수 있다.
 *
 * - 표시 없는 라우트: 통과(관여하지 않음)
 * - Origin 없음(서버·curl·네이티브): 통과 — 브라우저 교차출처 위협이 아니다
 * - Origin 있음: 서비스 루트 도메인(APP_ROOT_DOMAIN) 범위여야 통과, 아니면 403
 *
 * client_id 가 실리는 API 라우트의 오리진 검사는 여기가 아니라 ApiAccessService 가 한다
 * (그 클라이언트에 등록된 origins 와 정확히 대조).
 */
@Injectable()
export class FirstPartyGuard implements CanActivate {
  private readonly logger = new Logger(FirstPartyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(FIRST_PARTY_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin && !isFirstPartyOrigin(origin, this.config.rootDomain)) {
      this.logger.debug(`First-party guard rejected the origin: ${origin}`);
      throw new ForbiddenError(AuthErrorCode.APP_ORIGIN_NOT_ALLOWED);
    }
    return true;
  }
}
