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
      // 네이버는 이메일 검증 플래그를 주지 않는다(구글의 email_verified, 카카오의
      // is_email_verified 에 해당하는 값이 응답에 없다). 게다가 이 이메일은 identity 가 아니라
      // 사용자가 바꿀 수 있는 연락용 이메일이다. 검증됨으로 신뢰하면 안 되므로 false 로 둔다.
      // 우리 코드 인증을 거쳐야 소유로 인정한다.
      emailVerified: false,
    };
  }
}
