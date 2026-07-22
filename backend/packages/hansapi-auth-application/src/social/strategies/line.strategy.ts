import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { LineProfile, Strategy } from 'passport-line-auth';
import { OAuthProvider } from '@hansapi/data';

import { AUTH_CONFIG } from '../../auth.config';
import type { AuthConfig } from '../../auth.config';
import { SocialProfile } from '../social.types';

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
      callbackURL: `${config.oauth.callbackBaseUrl}/auth/line/callback`,
      scope: ['profile', 'openid', 'email'],
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
      emailVerified: !!email,
    };
  }
}
