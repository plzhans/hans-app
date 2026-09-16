import { Inject, Injectable } from '@nestjs/common';
import { JwtKeyStore, JwtVerifyError } from '@hansapp/jwt';
import { UnauthorizedError } from '@hansapp/common';

import { AdminErrorCode } from '../error';
import { ADMIN_AUTH_CONFIG, ADMIN_TOKEN_AUDIENCE } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';

/**
 * 관리자 토큰의 서명·검증.
 *
 * **대칭·비대칭을 설정이 고른다**(admin.jwt.keyDir). 예전에는 HS256 하나로 못박혀 있었고
 * 그래도 됐다 — 이 토큰을 검증하는 곳이 admin-api 하나뿐이었기 때문이다.
 * 배치가 "지금 실행" 요청을 검증하면서 소비자가 둘이 됐고, 그때부터 그 전제가 깨진다.
 * 대칭키를 나눠 주면 받은 쪽이 검증뿐 아니라 **서명도** 할 수 있어서, 배치가 뚫리면
 * 관리자 토큰을 찍어낼 수 있게 된다. 그래서 키를 나눠 줄 일이 생기면 비대칭이어야 한다.
 *
 * 무엇으로 서명했는지는 토큰 헤더에 적힌다. 검증하는 쪽은 그것을 보고 할 수 있는지를 정한다 —
 * HS256 이면 배치는 키가 없어 검증에 실패하고, 그 기능만 막힌다(로그인은 그대로다).
 */
@Injectable()
export class AdminJwtService extends JwtKeyStore {
  constructor(@Inject(ADMIN_AUTH_CONFIG) config: AdminAuthConfig) {
    super({
      keyDir: config.jwtKeyDir,
      fallbackSecret: config.jwtSecret,
      issuer: config.issuer,
      // 자기 issuer 는 설정 쪽에서 이미 포함돼 온다(auth.jwt 와 같은 규칙).
      allowedIssuers: config.allowedIssuers,
      tokenTtlSec: config.accessTokenTtlSec,
      label: AdminJwtService.name,
    });
  }

  /** 관리자 access token. 대상은 admin-api 다. */
  override sign(payload: object): string {
    return super.sign(payload, { audience: ADMIN_TOKEN_AUDIENCE });
  }

  override verify<T extends object = Record<string, unknown>>(token: string): T {
    try {
      return super.verify<T>(token, { audience: ADMIN_TOKEN_AUDIENCE });
    } catch (error) {
      if (error instanceof JwtVerifyError) {
        // 만료·서명 불일치·aud 불일치를 구분해 알려 주지 않는다 — 공격자에게 주는 힌트다.
        throw new UnauthorizedError(AdminErrorCode.ADMIN_TOKEN_INVALID, {
          message: 'Invalid or expired token.',
        });
      }
      throw error;
    }
  }

  /**
   * 다른 내부 서비스에 보낼 요청을 서명한다.
   *
   * **관리자 access token 을 그대로 넘기지 않는다.** 그 토큰은 admin-api 를 대상으로 발급된
   * 것이고 수명도 길다. 받는 쪽을 aud 로 못박고 수명을 짧게 끊은 별도 토큰을 찍어, 새더라도
   * 그 상대에게 그 시간 동안만 쓸 수 있게 한다.
   *
   * @param audience 받을 쪽. 그쪽이 같은 값을 요구해야 통과한다.
   * @param ttlSec 수명. 한 번의 호출이 오가는 시간이면 충분하다.
   */
  signServiceToken(audience: string, claims: object, ttlSec: number): string {
    return super.sign(claims, { audience, expiresInSec: ttlSec });
  }
}
