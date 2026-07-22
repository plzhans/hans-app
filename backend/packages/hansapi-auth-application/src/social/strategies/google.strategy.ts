import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { OAuthProvider } from '@hansapi/data';

import { AUTH_CONFIG } from '../../auth.config';
import type { AuthConfig } from '../../auth.config';
import { SocialProfile } from '../social.types';

/** 구글 OAuth2(OIDC) 전략. 전략 이름 'google' 은 라우트 :provider 파라미터와 일치한다. */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    const cfg = config.oauth.google;
    super({
      clientID: cfg?.clientId ?? '',
      clientSecret: cfg?.clientSecret ?? '',
      // 실제 redirect_uri 는 요청 호스트에서 SocialAuthGuard 가 주입한다(여긴 미사용 placeholder).
      callbackURL: 'http://localhost/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): SocialProfile {
    const email = profile.emails?.[0]?.value ?? null;
    const json = profile._json as { email_verified?: boolean } | undefined;
    return {
      provider: OAuthProvider.GOOGLE,
      providerId: profile.id,
      email,
      name: profile.displayName ?? null,
      emailVerified: !!email && json?.email_verified === true,
    };
  }
}
