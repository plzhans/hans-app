import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider } from '@hansapp/data';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';

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
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

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
    /** 복귀 대상 클라이언트. 없으면 1st-party(인증웹). 발급될 인가코드에 박힌다. */
    clientId?: string;
    /** PKCE code_challenge(S256). 해시라 노출돼도 안전하므로 state 로 운반한다. */
    codeChallenge?: string;
    /**
     * 클라이언트(외부 앱)가 만든 state. **우리는 해석하지 않고 최종 리다이렉트에 그대로 돌려준다.**
     * 그 앱이 CSRF 대조와 verifier 조회 키로 쓰므로, 왕복을 견뎌야 한다.
     */
    clientState?: string;
    /**
     * 이 흐름을 시작한 브라우저를 가리키는 짝. **CSRF 방어의 핵심이다.**
     *
     * 서명만으로는 "우리가 발급했다" 밖에 증명하지 못한다 — 공격자도 정상적으로 시작하면
     * 유효한 state 를 받아간다. 그래서 시작할 때 nonce 를 쿠키로도 심고, 콜백에서 둘을
     * 대조한다. 쿠키는 브라우저 밖으로 못 나가므로 링크를 남에게 넘겨도 따라가지 않는다.
     *
     * flowId 는 쿠키 이름을 흐름마다 갈라 **동시 로그인**(탭 여러 개)을 가능하게 한다.
     * 이름이 하나면 나중 탭이 앞 탭의 쿠키를 덮어써 앞쪽이 실패한다.
     */
    flowId?: string;
    nonce?: string;
    /**
     * "로그인 상태 유지" 선택. **화면에서 여기까지 실어 나르지 않으면 체크박스가 거짓말을 한다.**
     *
     * 소셜은 provider 를 들렀다 오는 사이 원래 요청이 끊긴다 — 선택을 붙잡아 둘 곳이
     * state 뿐이다. 서명돼 있으니 돌아오는 길에 바뀌지도 않는다.
     */
    persistent?: boolean;
  }): string {
    return this.jwt.sign(
      {
        token_use: 'oauth_state',
        intent: payload.intent,
        user_id: payload.userId,
        redirect_uri: payload.returnTo,
        client_id: payload.clientId,
        code_challenge: payload.codeChallenge,
        client_state: payload.clientState,
        flow_id: payload.flowId,
        nonce: payload.nonce,
        persistent: payload.persistent,
      },
      // 흐름 쿠키와 **같은 값**이어야 한다. 한쪽만 살아 있으면 정상 로그인이 거부된다.
      { expiresIn: this.config.socialFlowTtlSec },
    );
  }

  verifyState(token: string): {
    intent: 'login' | 'link';
    userId?: number;
    returnTo?: string;
    clientId?: string;
    codeChallenge?: string;
    clientState?: string;
    flowId?: string;
    nonce?: string;
    persistent?: boolean;
  } {
    const p = this.verify<{
      token_use: string;
      intent: 'login' | 'link';
      user_id?: number;
      redirect_uri?: string;
      client_id?: string;
      code_challenge?: string;
      client_state?: string;
      flow_id?: string;
      nonce?: string;
      persistent?: boolean;
    }>(token, 'oauth_state');
    return {
      intent: p.intent,
      userId: p.user_id,
      returnTo: p.redirect_uri,
      clientId: p.client_id,
      codeChallenge: p.code_challenge,
      clientState: p.client_state,
      flowId: p.flow_id,
      nonce: p.nonce,
      persistent: p.persistent,
    };
  }

  /** 연동(link) 시작 토큰. 로그인 상태에서 발급받아 GET /auth/:provider?link_token= 로 넘긴다. */
  signLinkPrepare(userId: number): string {
    return this.jwt.sign({ token_use: 'oauth_link', user_id: userId }, { expiresIn: 600 });
  }

  verifyLinkPrepare(token: string): { userId: number } {
    const p = this.verify<{ token_use: string; user_id: number }>(token, 'oauth_link');
    return { userId: p.user_id };
  }

  /** 소셜 pending 가입 티켓. 콜백→프론트로 넘기고 register 제출 시 검증한다. */
  signRegister(payload: {
    provider: OAuthProvider;
    providerId: string;
    email: string | null;
    name: string | null;
    emailVerified: boolean;
    /** 시작 화면에서 고른 "로그인 상태 유지". 가입을 마치고 바로 로그인시킬 때 쓴다. */
    persistent?: boolean;
  }): string {
    return this.jwt.sign(
      {
        token_use: 'oauth_register',
        provider: payload.provider,
        provider_id: payload.providerId,
        email: payload.email,
        name: payload.name,
        email_verified: payload.emailVerified,
        persistent: payload.persistent,
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
    persistent?: boolean;
  } {
    const p = this.verify<{
      token_use: string;
      provider: OAuthProvider;
      provider_id: string;
      email: string | null;
      name: string | null;
      email_verified: boolean;
      persistent?: boolean;
    }>(token, 'oauth_register');
    return {
      provider: p.provider,
      providerId: p.provider_id,
      email: p.email,
      name: p.name,
      emailVerified: p.email_verified,
      persistent: p.persistent,
    };
  }

  private verify<T extends { token_use: string }>(token: string, expected: string): T {
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
