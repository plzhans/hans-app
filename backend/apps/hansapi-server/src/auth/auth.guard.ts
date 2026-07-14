import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

/** 임시 통과 토큰. 추후 접두사 기반 JWT/API Key 검증으로 대체한다. */
const TEST_TOKEN = 'test';

/**
 * 전역 인증 가드. Authorization: Bearer <token> 헤더의 토큰을 검증한다.
 * - @Public() 라우트는 우회한다.
 * - 지금은 토큰이 'test' 이면 통과시킨다.
 * - 추후 토큰 접두사로 방식을 판별해 각 방식(JWT/API Key)으로 검증하며,
 *   @Auth 로 선언된 지원 방식(AUTH_TYPES_KEY 메타데이터)과 대조한다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    return this.validate(token);
  }

  /** Authorization: Bearer <token> 에서 토큰을 추출한다. */
  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }

  /**
   * 토큰을 검증한다. 지금은 'test' 만 통과시킨다.
   * 추후 토큰 접두사로 분기한다:
   *   - JWT 계열     → 서명/만료 검증
   *   - API Key 계열 → 저장소 조회/유효성 확인
   */
  private validate(token: string): boolean {
    if (token === TEST_TOKEN) {
      return true;
    }
    throw new UnauthorizedException('Invalid token.');
  }
}
