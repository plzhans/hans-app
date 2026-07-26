import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { LineProfile, Strategy } from 'passport-line-auth';
import { OAuthProvider } from '@hansapi/data';

import { AUTH_CONFIG } from '../../auth.config';
import type { AuthConfig } from '../../auth.config';
import { SocialProfile } from '../social.types';

/**
 * OAuth state 를 세션 없이 통과시키는 pass-through 스토어.
 *
 * passport-line-auth 는 내부에서 `options.state = true` 를 강제해 passport-oauth2 가
 * **SessionStore(express-session 필요)** 를 만든다. 우리는 세션을 쓰지 않고 서명 토큰으로 state 를
 * 운반·검증하므로(SocialTicketService, 컨트롤러에서 req.query.state 검증), 여기서 state 검증을 건너뛴다.
 * passport-oauth2 는 `options.store` 가 있으면 그것을 우선 사용한다 → 세션 의존을 제거한다.
 * (Google/Naver/Kakao 전략은 생성 시 state 를 안 넘겨 애초에 NullStore 라 이 문제가 없다.)
 */
const passthroughStateStore = {
  store(_req: unknown, ...args: unknown[]): void {
    (args[args.length - 1] as (err: unknown, state?: unknown) => void)(
      null,
      undefined,
    );
  },
  verify(_req: unknown, ...args: unknown[]): void {
    (args[args.length - 1] as (err: unknown, ok: boolean) => void)(null, true);
  },
};

/**
 * LINE 로그인 전략. LINE 은 channelID/channelSecret 을 쓰며 이메일은 별도 권한이 필요하다.
 * verify 시그니처가 (accessToken, refreshToken, params, profile) 로 params 가 하나 더 있다.
 */
@Injectable()
export class LineStrategy extends PassportStrategy(Strategy, 'line') {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    const cfg = config.oauth.line;
    super({
      channelID: cfg?.clientId ?? '',
      channelSecret: cfg?.clientSecret ?? '',
      // 실제 redirect_uri 는 요청 호스트에서 SocialAuthGuard 가 주입한다(여긴 미사용 placeholder).
      callbackURL: 'http://localhost/auth/line/callback',
      scope: ['profile', 'openid', 'email'],
      // 세션 없는 state 처리(위 설명 참고).
      store: passthroughStateStore,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    _params: unknown,
    profile: LineProfile,
  ): SocialProfile {
    const providerId = profile.userId ?? profile.id ?? profile._json?.sub ?? '';
    const email = profile.email ?? profile._json?.email ?? null;
    return {
      provider: OAuthProvider.LINE,
      providerId: String(providerId),
      email,
      name: profile.displayName ?? profile._json?.name ?? null,
      // 이메일 존재만으로 검증됨으로 치지 않는다. 신뢰 등급은 우리 코드 인증으로만 올린다
      // (구글의 email_verified 처럼 명시 검증 신호가 있는 provider 만 true 로 둔다).
      emailVerified: false,
    };
  }
}
