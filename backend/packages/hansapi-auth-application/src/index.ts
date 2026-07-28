// 모듈
export { AuthModule } from './auth-application.module';

// 서비스
export { AuthService } from './auth.service';
export type { AuthResult, RequestMeta } from './auth.service';
export { OAuthTokenService } from './oauth-token.service';
export { AppService, reviewStateOf } from './app/app.service';
export type {
  AppDetail,
  AppReviewState,
  CreatedApiKey,
  CreatedClient,
  CreateClientInput,
  UpdateClientInput,
  UserTierInfo,
} from './app/app.service';
// 앱 도메인 엔티티 타입(서버 컨트롤러 매핑용). 서버는 @hansapi/data 를 직접 의존하지 않는다.
export type { App, AppApiKey, AppClient } from '@hansapi/data';
// 앱/클라이언트 enum(값으로 씀 — DTO @IsEnum·컨트롤러 매핑).
// UserTier 는 CLI 가 --tier 값을 검증할 때 값으로 쓴다.
export { AppClientType, AppStatus, UserTier } from '@hansapi/data';
export { TokenService } from './token/token.service';
export { JwtKeyService } from './token/jwt-key.service';
export {
  generateAccessKeyPair,
  publicJwkFromPem,
  publicPemFromPem,
  jwkThumbprint,
  algForCurve,
  type AccessAlg,
  type GeneratedKey,
} from './token/jwt-keygen';
export type { AuthTokens } from './token/token.service';
export { ActionLogService } from './log/action-log.service';

// 소셜
export { SocialService } from './social/social.service';
export type { CallbackOutcome } from './social/social.service';
export { SocialTicketService } from './social/social-ticket.service';
export { SocialAuthGuard } from './social/social-auth.guard';
export { toOAuthProvider, toStrategyName } from './social/social.types';
export type { SocialProfile } from './social/social.types';

// 가드·데코레이터(서버가 컨트롤러에서 쓴다)
export { AuthGuard } from './guard/auth.guard';
export { FirstPartyGuard } from './guard/first-party.guard';
export { FirstPartyOnly } from './guard/first-party.decorator';
export { ApiAccessService } from './app/api-access.service';
export type { ApiAccess } from './app/api-access.service';
export { Auth } from './guard/auth.decorator';
export { Public } from './guard/public.decorator';
export { CurrentUser } from './guard/current-user.decorator';
export { AuthType } from './guard/auth-type.enum';
export type { AuthUser } from './guard/auth-user';

// 설정
export { AUTH_CONFIG, buildAuthConfig } from './auth.config';
export type { AuthConfig } from './auth.config';
export { isFirstPartyOrigin, normalizeRootDomain } from './first-party-origin';
export {
  MAIL_CONFIG,
  OTP_CONFIG,
  buildMailConfig,
  buildOtpConfig,
} from './mail/mail.config';
export type { MailConfig, SmtpConfig, OtpConfig } from './mail/mail.config';
export { EmailVerificationService } from './mail/email-verification.service';
// 이메일 인증 코드 용도 enum(값으로 씀 — 컨트롤러/DTO).
export { EmailVerifyPurpose } from '@hansapi/data';
