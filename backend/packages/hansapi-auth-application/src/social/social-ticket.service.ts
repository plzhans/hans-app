import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider } from '@hansapi/data';

/**
 * 소셜 흐름에서 브라우저 리다이렉트를 통해 오가는 짧은 서명 토큰들을 발급/검증한다.
 * 서버 상태(테이블) 없이 stateless 로 운반한다. 모두 access token 과 같은 비밀키로 서명하되
 * `token_use` 클레임으로 용도를 구분해 서로 오용되지 않게 한다.
 *
 * **클레임 이름은 OAuth/OIDC 표준 표기(snake_case)를 따른다.** 디코드해서 눈으로 볼 일이
 * 많은데(state 는 URL 에 그대로 노출된다) 약어는 그때 읽히지 않는다. 짧게 써서 아끼는 건
 * 30~40 bytes 뿐이라, URL 길이 안전선(~2000자)에 견주면 의미가 없다.
 *
 * `token_use` 는 JWT **헤더**의 표준 `typ`(RFC 7515)와 이름이 겹치지 않게 고른 것이다.
 * 둘 다 typ 이면 디코드했을 때 같은 이름이 두 번 나와 어느 쪽인지 분간이 안 된다.
 */
@Injectable()
export class SocialTicketService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * OAuth state(로그인/연동 의도 + 복귀 URL 운반). provider 왕복 후 콜백에서 검증한다.
   *
   * redirect_uri 는 로그인 성공 후 코드를 실어 돌려보낼 **프론트** URL 이다(진입 시 검증 완료).
   * provider 에게 주는 redirect_uri(=백엔드 콜백)와는 다른 값이니 혼동하지 말 것.
   *
   * **여기 담기는 값은 비밀이 아니어야 한다.** 서명은 위조만 막고 열람은 못 막는다 —
   * base64url 이라 누구나 디코드해 읽는다. code_challenge 는 해시라 안전하지만
   * code_verifier 를 넣으면 PKCE 가 통째로 무의미해진다.
   */
  signState(payload: {
    intent: 'login' | 'link';
    userId?: number;
    returnTo?: string;
    /** 복귀 대상 클라이언트. 없으면 1st-party(인증 포털). 발급될 인가코드에 박힌다. */
    clientId?: string;
  }): string {
    return this.jwt.sign(
      {
        token_use: 'oauth_state',
        intent: payload.intent,
        user_id: payload.userId,
        redirect_uri: payload.returnTo,
        client_id: payload.clientId,
      },
      { expiresIn: 600 },
    );
  }

  verifyState(token: string): {
    intent: 'login' | 'link';
    userId?: number;
    returnTo?: string;
    clientId?: string;
  } {
    const p = this.verify<{
      token_use: string;
      intent: 'login' | 'link';
      user_id?: number;
      redirect_uri?: string;
      client_id?: string;
    }>(token, 'oauth_state');
    return {
      intent: p.intent,
      userId: p.user_id,
      returnTo: p.redirect_uri,
      clientId: p.client_id,
    };
  }

  /** 연동(link) 시작 토큰. 로그인 상태에서 발급받아 GET /auth/:provider?link_token= 로 넘긴다. */
  signLinkPrepare(userId: number): string {
    return this.jwt.sign(
      { token_use: 'oauth_link', user_id: userId },
      { expiresIn: 600 },
    );
  }

  verifyLinkPrepare(token: string): { userId: number } {
    const p = this.verify<{ token_use: string; user_id: number }>(
      token,
      'oauth_link',
    );
    return { userId: p.user_id };
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
        token_use: 'oauth_register',
        provider: payload.provider,
        provider_id: payload.providerId,
        email: payload.email,
        name: payload.name,
        email_verified: payload.emailVerified,
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
      token_use: string;
      provider: OAuthProvider;
      provider_id: string;
      email: string | null;
      name: string | null;
      email_verified: boolean;
    }>(token, 'oauth_register');
    return {
      provider: p.provider,
      providerId: p.provider_id,
      email: p.email,
      name: p.name,
      emailVerified: p.email_verified,
    };
  }

  private verify<T extends { token_use: string }>(
    token: string,
    expected: string,
  ): T {
    let payload: T;
    try {
      payload = this.jwt.verify<T>(token);
    } catch {
      throw new BadRequestException('Invalid or expired token.');
    }
    if (payload.token_use !== expected) {
      throw new BadRequestException('Token purpose mismatch.');
    }
    return payload;
  }
}
