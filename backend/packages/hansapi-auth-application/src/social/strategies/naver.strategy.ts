import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-naver-v2';
import { OAuthProvider } from '@hansapi/data';

import { AUTH_CONFIG } from '../../auth.config';
import type { AuthConfig } from '../../auth.config';
import { SocialProfile } from '../social.types';

/** 네이버 로그인 전략(OIDC 아님, 네이버 프로필 API 기반). */
@Injectable()
export class NaverStrategy extends PassportStrategy(Strategy, 'naver') {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    const cfg = config.oauth.naver;
    super({
      clientID: cfg?.clientId ?? '',
      clientSecret: cfg?.clientSecret ?? '',
      // 실제 redirect_uri 는 요청 호스트에서 SocialAuthGuard 가 주입한다(여긴 미사용 placeholder).
      callbackURL: 'http://localhost/auth/naver/callback',
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): SocialProfile {
    const email = profile.email ?? null;
    return {
      provider: OAuthProvider.NAVER,
      providerId: String(profile.id),
      email,
      name: profile.name ?? profile.nickname ?? null,
      // 네이버 이메일은 검증된 계정 이메일이다.
      emailVerified: !!email,
    };
  }
}
