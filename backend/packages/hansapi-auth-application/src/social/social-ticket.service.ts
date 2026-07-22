import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider } from '@hansapi/data';

/**
 * 소셜 흐름에서 브라우저 리다이렉트를 통해 오가는 짧은 서명 토큰들을 발급/검증한다.
 * 서버 상태(테이블) 없이 stateless 로 운반한다. 모두 access token 과 같은 비밀키로 서명하되
 * `typ` 클레임으로 용도를 구분해 서로 오용되지 않게 한다.
 */
@Injectable()
export class SocialTicketService {
  constructor(private readonly jwt: JwtService) {}

  /** OAuth state(로그인/연동 의도 운반). provider 왕복 후 콜백에서 검증한다. */
  signState(payload: { intent: 'login' | 'link'; userId?: number }): string {
    return this.jwt.sign(
      { typ: 'oauth_state', intent: payload.intent, uid: payload.userId },
      { expiresIn: 600 },
    );
  }

  verifyState(token: string): { intent: 'login' | 'link'; userId?: number } {
    const p = this.verify<{
      typ: string;
      intent: 'login' | 'link';
      uid?: number;
    }>(token, 'oauth_state');
    return { intent: p.intent, userId: p.uid };
  }

  /** 연동(link) 시작 토큰. 로그인 상태에서 발급받아 GET /auth/:provider?link_token= 로 넘긴다. */
  signLinkPrepare(userId: number): string {
    return this.jwt.sign(
      { typ: 'oauth_link', uid: userId },
      { expiresIn: 600 },
    );
  }

  verifyLinkPrepare(token: string): { userId: number } {
    const p = this.verify<{ typ: string; uid: number }>(token, 'oauth_link');
    return { userId: p.uid };
  }

  /** 소셜 pending 가입 티켓. 콜백→프론트로 넘기고 register 제출 시 검증한다. */
  signRegister(payload: {
    provider: OAuthProvider;
    providerId: string;
    email: string | null;
    name: string | null;
    emailVerified: boolean;
  }): string {
    return this.jwt.sign(
      {
        typ: 'oauth_register',
        provider: payload.provider,
        pid: payload.providerId,
        email: payload.email,
        name: payload.name,
        ev: payload.emailVerified,
      },
      { expiresIn: 900 },
    );
  }

  verifyRegister(token: string): {
    provider: OAuthProvider;
    providerId: string;
    email: string | null;
    name: string | null;
    emailVerified: boolean;
  } {
    const p = this.verify<{
      typ: string;
      provider: OAuthProvider;
      pid: string;
      email: string | null;
      name: string | null;
      ev: boolean;
    }>(token, 'oauth_register');
    return {
      provider: p.provider,
      providerId: p.pid,
      email: p.email,
      name: p.name,
      emailVerified: p.ev,
    };
  }

  private verify<T extends { typ: string }>(
    token: string,
    expected: string,
  ): T {
    let payload: T;
    try {
      payload = this.jwt.verify<T>(token);
    } catch {
      throw new BadRequestException('유효하지 않거나 만료된 토큰입니다.');
    }
    if (payload.typ !== expected) {
      throw new BadRequestException('토큰 용도가 올바르지 않습니다.');
    }
    return payload;
  }
}
