// 모듈
export { AuthModule } from './auth-application.module';

// 서비스
export { AuthService } from './auth.service';
export type { AuthResult, RequestMeta } from './auth.service';
export { OAuthTokenService } from './oauth-token.service';
export { AppService } from './app/app.service';
export type {
  AppDetail,
  CreatedApiKey,
  CreatedClient,
} from './app/app.service';
// 앱 도메인 엔티티 타입(서버 컨트롤러 매핑용). 서버는 @hansapi/data 를 직접 의존하지 않는다.
export type { App, AppApiKey, AppClient } from '@hansapi/data';
export { TokenService } from './token/token.service';
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
export { Auth } from './guard/auth.decorator';
export { Public } from './guard/public.decorator';
export { CurrentUser } from './guard/current-user.decorator';
export { AuthType } from './guard/auth-type.enum';
export type { AuthUser } from './guard/auth-user';

// 설정
export { AUTH_CONFIG, buildAuthConfig } from './auth.config';
export type { AuthConfig } from './auth.config';
