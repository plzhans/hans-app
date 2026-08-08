import { Injectable, NotFoundException } from '@nestjs/common';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as NaverStrategy } from 'passport-naver-v2';
import type { Profile as NaverProfile } from 'passport-naver-v2';
import { Strategy as KakaoStrategy } from 'passport-kakao';
import type { KakaoProfile } from 'passport-kakao';
import { Strategy as LineStrategy } from 'passport-line-auth';
import type { LineProfile } from 'passport-line-auth';
import { OAuthProvider } from '@hansapp/data';

import { SettingCache } from '../setting/setting-cache.service';
import { SocialProfile } from './social.types';

/** passport 전략이 갖춰야 하는 최소 모양. authenticate 가 있으면 passport 가 인스턴스를 그대로 쓴다. */
export interface RequestStrategy {
  authenticate(req: unknown, options?: unknown): void;
}

export type SocialKey = 'google' | 'naver' | 'kakao' | 'line';

/**
 * 요청 전용 소셜 전략을 만든다. **passport 레지스트리에 등록하지 않는다.**
 *
 * [왜 등록하지 않나]
 * `passport.use(name, strategy)` 는 부팅 때 한 번 도는 등록이라, 자격증명이 그 시점에
 * 확정된다. 키가 DB(env_setting)로 옮겨간 지금은 그럴 수가 없다 — 관리 화면에서 Client
 * Secret 을 바꿔도 재시작 전까지 옛 값으로 인가 요청이 나간다.
 *
 * passport 0.7 의 `authenticate()` 는 **이름 대신 전략 인스턴스**를 받는다. 인스턴스에
 * `authenticate` 메서드가 있으면 레지스트리를 거치지 않는다(passport/lib/middleware/authenticate.js).
 * 그래서 요청마다 새로 만들어 넘기면 된다 — 만드는 비용은 객체 하나뿐이다.
 *
 * [앞으로]
 * 앱마다 제 OAuth 앱을 등록하게 할 수 있다. 그때는 `create()` 에 그 앱의 자격증명을 넘기면
 * 되고, 이 자리가 이미 열려 있어 호출부는 인자만 채우면 된다.
 */
@Injectable()
export class SocialStrategyFactory {
  constructor(private readonly settings: SettingCache) {}

  /**
   * @param key       어느 소셜인가(:provider 파라미터에서 온다)
   * @param callbackURL 요청 호스트에서 조립한 redirect_uri
   * @throws NotFoundException 자격증명이 없을 때. **설정 안 된 provider 는 404 다** —
   *   키가 .env 에 있던 시절과 같은 응답이고, 판정의 출처만 DB 로 바뀌었다.
   */
  async create(key: SocialKey, callbackURL: string): Promise<RequestStrategy> {
    const clientId = await this.settings.getString(`${key}.clientId`);
    const clientSecret =
      (await this.settings.getString(`${key}.clientSecret`)) ?? '';

    /*
      **카카오만 secret 이 선택이다.** REST API 키를 client_id 로 쓰고, client secret 은
      콘솔의 '카카오 로그인 > 보안' 에서 켰을 때만 있다. 없다고 비활성으로 보면 켜 둔 적 없는
      앱이 통째로 404 가 된다.
    */
    const ready = key === 'kakao' ? !!clientId : !!clientId && !!clientSecret;
    if (!ready) {
      throw new NotFoundException(`Social provider is not configured: ${key}`);
    }
    return build(key, clientId as string, clientSecret, callbackURL);
  }
}

function build(
  key: SocialKey,
  clientID: string,
  clientSecret: string,
  callbackURL: string,
): RequestStrategy {
  /*
    verify 콜백이 done 에 넘기는 값이 그대로 req.user 가 된다. 예전 전략 클래스의
    validate() 가 하던 일을 그대로 옮긴 것이다 — 매핑 규칙은 한 줄도 바뀌지 않았다.
  */
  if (key === 'google') {
    return new GoogleStrategy(
      { clientID, clientSecret, callbackURL, scope: ['email', 'profile'] },
      (_at: string, _rt: string, profile: GoogleProfile, done: Done) =>
        done(null, toGoogle(profile)),
    );
  }

  if (key === 'naver') {
    return new NaverStrategy(
      { clientID, clientSecret, callbackURL },
      (_at: string, _rt: string, profile: NaverProfile, done: Done) =>
        done(null, toNaver(profile)),
    );
  }

  if (key === 'kakao') {
    return new KakaoStrategy(
      { clientID, clientSecret, callbackURL },
      (_at: string, _rt: string, profile: KakaoProfile, done: Done) =>
        done(null, toKakao(profile)),
    ) as unknown as RequestStrategy;
  }

  return new LineStrategy(
    {
      // LINE 만 이름이 다르다 — channelID/channelSecret 이다.
      channelID: clientID,
      channelSecret: clientSecret,
      callbackURL,
      scope: ['profile', 'openid', 'email'],
      // 세션 없는 state 처리(아래 설명 참고).
      store: passthroughStateStore,
    },
    // LINE 만 verify 인자가 하나 더 있다(params).
    (
      _at: string,
      _rt: string,
      _params: unknown,
      profile: LineProfile,
      done: Done,
    ) => done(null, toLine(profile)),
  ) as unknown as RequestStrategy;
}

type Done = (err: unknown, user?: SocialProfile) => void;

/**
 * OAuth state 를 세션 없이 통과시키는 pass-through 스토어.
 *
 * passport-line-auth 는 내부에서 `options.state = true` 를 강제해 passport-oauth2 가
 * **SessionStore(express-session 필요)** 를 만든다. 우리는 세션을 쓰지 않고 서명 토큰으로 state 를
 * 운반·검증하므로(SocialTicketService), 여기서 state 검증을 건너뛴다. passport-oauth2 는
 * `options.store` 가 있으면 그것을 우선 쓴다 → 세션 의존을 제거한다.
 * (구글·네이버·카카오는 생성 시 state 를 안 넘겨 애초에 NullStore 라 이 문제가 없다.)
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

// ── profile → SocialProfile. 예전 전략 클래스의 validate() 를 그대로 옮겼다 ──

function toGoogle(profile: GoogleProfile): SocialProfile {
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

function toNaver(profile: NaverProfile): SocialProfile {
  return {
    provider: OAuthProvider.NAVER,
    providerId: String(profile.id),
    email: profile.email ?? null,
    name: profile.name ?? profile.nickname ?? null,
    /*
      네이버는 이메일 검증 플래그를 주지 않는다(구글의 email_verified, 카카오의
      is_email_verified 에 해당하는 값이 응답에 없다). 게다가 이 이메일은 identity 가 아니라
      사용자가 바꿀 수 있는 연락용 이메일이다. 검증됨으로 신뢰하면 안 되므로 false 로 둔다.
    */
    emailVerified: false,
  };
}

function toKakao(profile: KakaoProfile): SocialProfile {
  const account = profile._json?.kakao_account;
  const email = account?.email ?? null;
  return {
    provider: OAuthProvider.KAKAO,
    providerId: String(profile.id),
    email,
    name:
      profile.displayName ??
      account?.profile?.nickname ??
      profile._json?.properties?.nickname ??
      null,
    emailVerified: !!email && account?.is_email_verified === true,
  };
}

function toLine(profile: LineProfile): SocialProfile {
  const providerId = profile.userId ?? profile.id ?? profile._json?.sub ?? '';
  return {
    provider: OAuthProvider.LINE,
    providerId: String(providerId),
    email: profile.email ?? profile._json?.email ?? null,
    name: profile.displayName ?? profile._json?.name ?? null,
    // 이메일 존재만으로 검증됨으로 치지 않는다. 명시 검증 신호가 있는 provider 만 true 다.
    emailVerified: false,
  };
}
