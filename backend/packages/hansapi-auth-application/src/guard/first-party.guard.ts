import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ALLOWED_ORIGINS } from '../auth.config';
import { FIRST_PARTY_ONLY_KEY } from './first-party.decorator';

/**
 * @FirstPartyOnly() 라우트의 **Origin 검사** 가드. 인증(AuthGuard)과 별개 축이다.
 *
 * CORS 를 느슨하게(요청 오리진 반사) 두었으므로, 쿠키를 다루는 라우트는 스스로 오리진을 봐야 한다.
 * Origin 은 브라우저가 강제로 채우고 스크립트가 못 바꾸므로 신뢰할 수 있다.
 *
 * - 표시 없는 라우트: 통과(관여하지 않음)
 * - Origin 없음(서버·curl·네이티브): 통과 — 브라우저 교차출처 위협이 아니다
 * - Origin 있음: AUTH_ALLOWED_ORIGINS 에 있어야 통과, 아니면 403
 *
 * client_id 가 실리는 API 라우트의 오리진 검사는 여기가 아니라 ApiAccessService 가 한다
 * (그 클라이언트에 등록된 origins 와 정확히 대조).
 */
@Injectable()
export class FirstPartyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ALLOWED_ORIGINS) private readonly allowedOrigins: readonly string[],
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      FIRST_PARTY_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin && !this.allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Origin not allowed.');
    }
    return true;
  }
}
