import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { KakaoProfile, Strategy } from 'passport-kakao';
import { OAuthProvider } from '@hansapp/data';

import { AUTH_CONFIG } from '../../auth.config';
import type { AuthConfig } from '../../auth.config';
import { SocialProfile } from '../social.types';

/** 카카오 로그인 전략. 이메일은 동의 항목이라 없을 수 있다(그 경우 register 에서 사용자 입력). */
@Injectable()
export class KakaoStrategy extends PassportStrategy(Strategy, 'kakao') {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    const cfg = config.oauth.kakao;
    super({
      clientID: cfg?.clientId ?? '',
      clientSecret: cfg?.clientSecret ?? '',
      // 실제 redirect_uri 는 요청 호스트에서 SocialAuthGuard 가 주입한다(여긴 미사용 placeholder).
      callbackURL: 'http://localhost/auth/kakao/callback',
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: KakaoProfile,
  ): SocialProfile {
    const account = profile._json?.kakao_account;
    const email = account?.email ?? null;
    const name =
      profile.displayName ??
      account?.profile?.nickname ??
      profile._json?.properties?.nickname ??
      null;
    return {
      provider: OAuthProvider.KAKAO,
      providerId: String(profile.id),
      email,
      name,
      emailVerified: !!email && account?.is_email_verified === true,
    };
  }
}
