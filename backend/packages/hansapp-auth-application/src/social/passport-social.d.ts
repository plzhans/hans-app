// 타입 정의를 제공하지 않는 소셜 전략 패키지의 최소 ambient 선언.
// (passport-google-oauth20 은 @types, passport-naver-v2 는 자체 .d.ts 를 제공한다.)

declare module 'passport-kakao' {
  export interface KakaoStrategyOptions {
    clientID: string;
    clientSecret?: string;
    callbackURL: string;
    [key: string]: unknown;
  }
  export type KakaoProfile = {
    id: number | string;
    username?: string;
    displayName?: string;
    _json?: {
      kakao_account?: {
        email?: string;
        is_email_verified?: boolean;
        profile?: { nickname?: string };
      };
      properties?: { nickname?: string };
    };
    [key: string]: unknown;
  };
  export type VerifyCallback = (
    error: unknown,
    user?: unknown,
    info?: unknown,
  ) => void;
  export class Strategy {
    constructor(
      options: KakaoStrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: KakaoProfile,
        done: VerifyCallback,
      ) => void,
    );
    name: string;
  }
}

declare module 'passport-line-auth' {
  export interface LineStrategyOptions {
    channelID: string;
    channelSecret: string;
    callbackURL: string;
    scope?: string | string[];
    botPrompt?: string;
    [key: string]: unknown;
  }
  export type LineProfile = {
    id?: string;
    userId?: string;
    displayName?: string;
    email?: string;
    _json?: { sub?: string; email?: string; name?: string };
    [key: string]: unknown;
  };
  export type VerifyCallback = (
    error: unknown,
    user?: unknown,
    info?: unknown,
  ) => void;
  export class Strategy {
    constructor(
      options: LineStrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        params: unknown,
        profile: LineProfile,
        done: VerifyCallback,
      ) => void,
    );
    name: string;
  }
}
