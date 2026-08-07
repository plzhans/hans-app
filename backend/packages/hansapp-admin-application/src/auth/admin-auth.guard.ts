import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AdminAuthUser } from './admin-auth-user';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from './allow-password-change.decorator';
import { IS_ADMIN_PUBLIC_KEY } from './admin-public.decorator';
import { AdminTokenService } from './admin-token.service';

type AdminRequest = Request & { admin?: AdminAuthUser };

/**
 * 전역 관리자 인증 가드. `Authorization: Bearer <access token>` 하나만 본다.
 *
 * - `@AdminPublic()` 라우트는 우회한다(로그인·갱신·로그아웃·헬스체크).
 * - refresh token 은 여기서 다루지 않는다 — 토큰 엔드포인트에서만 교환된다.
 * - API 키/서비스 키 같은 대체 자격은 없다. 관리자 API 를 부르는 것은 관리자 SPA 뿐이다.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AdminTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_ADMIN_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = extractBearer(request);
    if (!token) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    const payload = this.tokens.verifyAccessToken(token);
    const mustChangePassword = payload.chg === true;
    request.admin = {
      adminId: Number(payload.sub),
      sessionId: payload.sid,
      mustChangePassword,
    };

    /*
      **비밀번호를 바꾸기 전에는 여기서 막힌다.**

      화면에서 변경 페이지로 보내는 것만으로는 강제가 되지 않는다 — 주소를 바꾸거나 API 를
      직접 부르면 그만이다. 남이 정해 준 비밀번호(부팅 자동 생성·CLI 발급)로 로그인한 상태이므로,
      그 값을 아는 사람이 곧바로 업무 API 를 부를 수 있으면 강제 변경을 둔 의미가 없다.
    */
    if (mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_DURING_PASSWORD_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        // 401 이 아니라 403 이다. 인증은 통과했고 자격이 모자란 것이라,
        // 프론트가 401 로 오해해 토큰 갱신을 반복하는 일이 없어야 한다.
        throw new ForbiddenException('Password change required.');
      }
    }

    return true;
  }
}

/** Authorization: Bearer <token>. 스킴은 대소문자 무관(RFC 7235). */
function extractBearer(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, value] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
