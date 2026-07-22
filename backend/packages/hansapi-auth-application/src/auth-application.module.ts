import { DynamicModule, Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EnvSource } from '@hansapi/common';
import { DataModule } from '@hansapi/data';

import { AUTH_CONFIG, buildAuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import { OAuthTokenService } from './oauth-token.service';
import { TokenService } from './token/token.service';
import { ActionLogService } from './log/action-log.service';
import { AuthGuard } from './guard/auth.guard';
import { UserRepository } from './repository/user.repository';
import { UserOAuthRepository } from './repository/user-oauth.repository';
import { UserTokenRepository } from './repository/user-token.repository';
import { TokenSessionRepository } from './repository/token-session.repository';
import { AuthCodeRepository } from './repository/auth-code.repository';
import { WithdrawalRepository } from './repository/withdrawal.repository';
import { SocialService } from './social/social.service';
import { SocialTicketService } from './social/social-ticket.service';
import { SocialAuthGuard } from './social/social-auth.guard';
import { GoogleStrategy } from './social/strategies/google.strategy';
import { NaverStrategy } from './social/strategies/naver.strategy';
import { KakaoStrategy } from './social/strategies/kakao.strategy';
import { LineStrategy } from './social/strategies/line.strategy';

/**
 * 인증/인가 응용 계층의 DI 진입점. 서버 앱은 `imports: [AuthModule.forRoot(src)]` 로 주입받고,
 * 전역 가드는 `{ provide: APP_GUARD, useExisting: AuthGuard }` 로 등록한다.
 *
 * DB 접근은 기존 DataModule(@hansapi/data)에 위임한다 — auth 모델은 멀티파일 스키마의
 * auth.prisma 로 분리돼 있지만 커넥션/클라이언트는 공유한다(풀을 늘리지 않는다).
 * 설정은 forRoot 로 EnvSource 를 받아 이 계층이 직접 뽑고 검증한다.
 * AUTH_JWT_SECRET 이 없으면 부팅 시점에 즉시 실패한다.
 *
 * 소셜 provider 전략(google/naver/kakao/line)은 후속 단계에서 이 모듈에 추가된다.
 */
@Module({})
export class AuthModule {
  static forRoot(source: EnvSource): DynamicModule {
    const config = buildAuthConfig(source);

    // 설정된 소셜 provider 의 전략만 등록한다(키가 없으면 전략을 만들지 않는다 → 서버는 그대로 뜬다).
    const strategyProviders: Provider[] = [];
    if (config.oauth.google) strategyProviders.push(GoogleStrategy);
    if (config.oauth.naver) strategyProviders.push(NaverStrategy);
    if (config.oauth.kakao) strategyProviders.push(KakaoStrategy);
    if (config.oauth.line) strategyProviders.push(LineStrategy);

    return {
      module: AuthModule,
      imports: [
        DataModule.forRoot(source),
        PassportModule,
        JwtModule.register({
          secret: config.jwtSecret,
          signOptions: { expiresIn: config.accessTokenTtlSec },
        }),
      ],
      providers: [
        { provide: AUTH_CONFIG, useValue: config },
        // 저장소(DB 접근). 서비스 내부 의존이라 export 하지 않는다.
        UserRepository,
        UserOAuthRepository,
        UserTokenRepository,
        TokenSessionRepository,
        AuthCodeRepository,
        WithdrawalRepository,
        // 서비스/가드
        ActionLogService,
        TokenService,
        AuthService,
        OAuthTokenService,
        AuthGuard,
        // 소셜
        SocialTicketService,
        SocialService,
        SocialAuthGuard,
        ...strategyProviders,
      ],
      exports: [
        AUTH_CONFIG,
        TokenService,
        AuthService,
        OAuthTokenService,
        ActionLogService,
        AuthGuard,
        SocialService,
        SocialAuthGuard,
        SocialTicketService,
      ],
    };
  }
}
