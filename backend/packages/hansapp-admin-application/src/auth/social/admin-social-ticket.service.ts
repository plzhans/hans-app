import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ADMIN_AUTH_CONFIG, ADMIN_TOKEN_AUDIENCE } from '../admin-auth.config';
import type { AdminAuthConfig } from '../admin-auth.config';

/**
 * OAuth state 의 수명. **10분.**
 *
 * 구글 계정 선택 화면에서 계정을 새로 추가하거나 2단계 인증을 거치면 몇 분이 걸린다.
 * 반대로 길게 두면 흐름을 시작해 두고 나중에 쓰는 창이 그만큼 열린다.
 */
const STATE_TTL_SEC = 600;

/**
 * 연동 티켓의 수명. **3분.**
 *
 * 화면에서 "연동" 을 누른 직후 곧바로 구글로 떠나므로 짧아도 된다. 이 티켓은 로그인한
 * 관리자 자격을 브라우저 이동(navigation)에 실어 나르는 값이라 오래 살릴수록 손해다.
 */
const LINK_TICKET_TTL_SEC = 180;

/** state 에 실려 구글을 왕복하는 값. **비밀은 담지 않는다** — 서명은 위조만 막는다. */
export interface AdminOAuthState {
  /** 로그인하러 온 것인가, 이미 로그인한 계정에 붙이러 온 것인가. */
  readonly intent: 'login' | 'link';
  /** intent=link 일 때 붙일 대상. */
  readonly adminId?: number;
  /** 끝나고 돌아갈 콘솔 안의 경로(`/admins` 처럼 `/` 로 시작하는 값만 허용한다). */
  readonly returnTo?: string;
  /** 흐름 소유권 확인용 쿠키의 이름과 값. 콜백에서 이 짝을 대조한다. */
  readonly flowId: string;
  readonly nonce: string;
}

/**
 * 소셜 흐름에서 브라우저를 통해 오가는 짧은 서명 토큰. **서버 상태 없이 운반한다.**
 *
 * 서명 키는 admin access token 과 같은 것을 쓰되 `token_use` 로 용도를 가른다 — 이 토큰이
 * access token 자리에 들어가거나 그 반대가 되면 안 된다. 검증할 때 그 값을 반드시 확인한다.
 *
 * AdminJwtService 를 쓰지 않고 JwtService 를 따로 드는 이유는 만료 때문이다. 그쪽은 access
 * token 용이라 5분으로 굳어 있는데, state 와 연동 티켓은 서로 다른 수명이 필요하다.
 */
@Injectable()
export class AdminSocialTicketService {
  private readonly jwt = new JwtService({});

  constructor(@Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig) {}

  signState(state: AdminOAuthState): string {
    return this.sign('admin_oauth_state', STATE_TTL_SEC, {
      intent: state.intent,
      admin_id: state.adminId,
      return_to: state.returnTo,
      flow_id: state.flowId,
      nonce: state.nonce,
    });
  }

  verifyState(raw: string): AdminOAuthState {
    const claims = this.verify('admin_oauth_state', raw);
    const intent = claims.intent === 'link' ? 'link' : 'login';
    const flowId = typeof claims.flow_id === 'string' ? claims.flow_id : '';
    const nonce = typeof claims.nonce === 'string' ? claims.nonce : '';
    if (!flowId || !nonce) {
      throw new BadRequestException('Stale sign-in flow. Please try again.');
    }
    return {
      intent,
      adminId: typeof claims.admin_id === 'number' ? claims.admin_id : undefined,
      returnTo: typeof claims.return_to === 'string' ? claims.return_to : undefined,
      flowId,
      nonce,
    };
  }

  /**
   * 연동 티켓. 로그인한 화면이 받아 `?link_token=` 으로 흐름을 시작하는 데 쓴다.
   *
   * **연동을 시작하는 요청에는 Authorization 헤더를 실을 수 없다** — 브라우저를 구글로
   * 보내는 top-level navigation 이라 헤더를 붙일 자리가 없다. 그 자격을 대신 나르는 값이다.
   */
  signLinkTicket(adminId: number): string {
    return this.sign('admin_oauth_link', LINK_TICKET_TTL_SEC, { admin_id: adminId });
  }

  verifyLinkTicket(raw: string): number {
    const claims = this.verify('admin_oauth_link', raw);
    if (typeof claims.admin_id !== 'number') {
      throw new BadRequestException('Invalid link ticket.');
    }
    return claims.admin_id;
  }

  private sign(tokenUse: string, ttlSec: number, payload: Record<string, unknown>): string {
    return this.jwt.sign(
      { token_use: tokenUse, ...payload },
      {
        secret: this.config.jwtSecret,
        algorithm: 'HS256',
        expiresIn: ttlSec,
        audience: ADMIN_TOKEN_AUDIENCE,
        ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
      },
    );
  }

  private verify(tokenUse: string, raw: string): Record<string, unknown> {
    let claims: Record<string, unknown>;
    try {
      claims = this.jwt.verify<Record<string, unknown>>(raw, {
        secret: this.config.jwtSecret,
        // 알고리즘을 못박는다 — 비우면 토큰 헤더의 alg 를 믿어 alg 혼동 공격이 열린다.
        algorithms: ['HS256'],
        audience: ADMIN_TOKEN_AUDIENCE,
        ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
      });
    } catch {
      throw new BadRequestException('Sign-in flow expired. Please try again.');
    }
    /*
      **용도를 반드시 대조한다.** 서명 키가 access token 과 같아서, 이 확인이 없으면
      access token 을 state 자리에 넣어도 통과한다(그 반대도 마찬가지다).
    */
    if (claims.token_use !== tokenUse) {
      throw new BadRequestException('Invalid token.');
    }
    return claims;
  }
}
