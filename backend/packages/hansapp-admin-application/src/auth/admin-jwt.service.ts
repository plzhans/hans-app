import { Inject, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '@hansapp/common';
import { AdminErrorCode } from '../error';
import { JwtService } from '@nestjs/jwt';

import { ADMIN_AUTH_CONFIG, ADMIN_TOKEN_AUDIENCE } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';

/**
 * admin access token 의 서명·검증. **HS256 대칭키만 쓴다.**
 *
 * 공개 API 는 ES256 키파일과 JWKS 공개를 지원하는데, 그건 "다른 서비스가 공개키로 검증한다" 를
 * 위한 장치다. admin access token 의 소비자는 hansapp-admin-api 하나뿐이라 키 발급·로테이션·
 * 배포 마운트 절차만 늘고 얻는 것이 없다.
 *
 * JwtModule 을 import 하지 않고 인스턴스를 직접 들고 있는다 — 전역 JwtService 설정(공개 API 쪽)과
 * 섞이지 않게, 키를 매 호출 옵션으로 넘긴다.
 */
@Injectable()
export class AdminJwtService {
  private readonly jwt = new JwtService({});

  constructor(@Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig) {}

  sign(payload: object): string {
    return this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      algorithm: 'HS256',
      expiresIn: this.config.accessTokenTtlSec,
      audience: ADMIN_TOKEN_AUDIENCE,
      ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
    });
  }

  verify<T extends object = Record<string, unknown>>(token: string): T {
    try {
      return this.jwt.verify<T>(token, {
        secret: this.config.jwtSecret,
        // **알고리즘을 반드시 못박는다.** 비우면 토큰 헤더의 alg 를 그대로 믿어
        // alg 혼동 공격(none, 키 종류 바꿔치기)이 열린다.
        algorithms: ['HS256'],
        audience: ADMIN_TOKEN_AUDIENCE,
        ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
      });
    } catch {
      // 만료·서명 불일치·aud 불일치를 구분해 알려 주지 않는다 — 공격자에게 주는 힌트다.
      throw new UnauthorizedError(AdminErrorCode.ADMIN_TOKEN_INVALID, {
        message: 'Invalid or expired token.',
      });
    }
  }
}
