import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  buildSettingKeyring,
  SETTING_KEYRING,
  type ConfigSource,
  type SecretBoxKeys,
} from '@hansapp/common';
import { DataModule, SettingReadRepository } from '@hansapp/data';

import {
  ACCESS_CACHE_CONFIG,
  AUTH_CONFIG,
  PROFILE_CACHE_CONFIG,
  SESSION_CACHE_CONFIG,
  buildAuthConfig,
} from './auth.config';
import { MAIL_CONFIG, OTP_CONFIG, buildMailConfig, buildOtpConfig } from './mail/mail.config';
import { EmailVerificationRepository } from './mail/email-verification.repository';
import { EmailVerificationService } from './mail/email-verification.service';
import { EmailSender, EMAIL_SETTINGS_SOURCE } from '@hansapp/email-sender';

import { AuthEmailService } from './mail/auth-email.service';
import { MailSettingsSource } from './mail/mail-settings.source';
import { SocialStrategyFactory } from './social/social-strategy.factory';
import { SettingCache } from './setting/setting-cache.service';
import { AuthService } from './auth.service';
import { LoginService } from './login.service';
import { OAuthTokenService } from './oauth-token.service';
import { TokenService } from './token/token.service';
import { JwtKeyService } from './token/jwt-key.service';
import { AuthLogService } from './log/auth-log.service';
import { AuthGuard } from './guard/auth.guard';
import { FirstPartyGuard } from './guard/first-party.guard';
import { UserRepository } from './repository/user.repository';
import { UserOAuthRepository } from './repository/user-oauth.repository';
import { UserConsentRepository } from './repository/user-consent.repository';
import { ConsentService } from './consent.service';
import { SessionTrimService } from './session-trim.service';
import { SessionTrimHandler } from './session-trim.handler';
import { SessionCache } from './session-cache.service';
import { ProfileCache } from './profile-cache.service';
import { ProfileCacheHandler } from './profile-cache.handler';
import { SessionCacheHandler } from './session-cache.handler';
import { TokenSessionRepository } from './repository/token-session.repository';
import { AuthCodeRepository } from './repository/auth-code.repository';
import { WithdrawalRepository } from './repository/withdrawal.repository';
import { AppRepository } from './app/app.repository';
import { AppService } from './app/app.service';
import { APP_SECRET_CONFIG, buildAppSecretConfig } from './app/app-secret.config';
import { LlmKeyRepository } from './app/llm-key.repository';
import { LlmKeyService } from './app/llm-key.service';
import { AccessCache } from './app/access-cache.service';
import { ApiAccessService } from './app/api-access.service';
import { SocialService } from './social/social.service';
import { SocialTicketService } from './social/social-ticket.service';
import { SocialAuthGuard } from './social/social-auth.guard';

/**
 * 인증/인가 응용 계층의 DI 진입점. 서버 앱은 `imports: [AuthModule.forRoot(src)]` 로 주입받고,
 * 전역 가드는 `{ provide: APP_GUARD, useExisting: AuthGuard }` 로 등록한다.
 *
 * DB 접근은 기존 DataModule(@hansapp/data)에 위임한다 — auth 모델은 멀티파일 스키마의
 * auth.prisma 로 분리돼 있지만 커넥션/클라이언트는 공유한다(풀을 늘리지 않는다).
 * 설정은 forRoot 로 ConfigSource 를 받아 이 계층이 직접 뽑고 검증한다.
 * AUTH_JWT_SECRET 이 없으면 부팅 시점에 즉시 실패한다.
 *
 * 소셜 provider 전략(google/naver/kakao/line)은 후속 단계에서 이 모듈에 추가된다.
 */
@Module({})
export class AuthModule {
  static forRoot(source: ConfigSource): DynamicModule {
    const config = buildAuthConfig(source);
    const mailConfig = buildMailConfig(source);
    const otpConfig = buildOtpConfig(source);

    // 설정된 소셜 provider 의 전략만 등록한다(키가 없으면 전략을 만들지 않는다 → 서버는 그대로 뜬다).
    /*
      **소셜 전략을 여기서 등록하지 않는다.** 자격증명이 DB(env_setting)에 있어 부팅 때
      확정할 수 없다 — SocialStrategyFactory 가 요청마다 만든다. 그래서 "설정된 provider 만
      등록" 하던 조건 분기도 사라졌고, 키를 화면에서 바꾸면 재시작 없이 반영된다.
    */

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
        { provide: MAIL_CONFIG, useValue: mailConfig },
        /*
          발송기(@hansapp/email-sender)는 SMTP 만 안다. 값이 어디서 오는지는 이 어댑터가
          정한다 — 지금은 설정 파일, 다음 단계에서 DB 로 갈아끼운다.
        */
        /*
          설정 읽기. **이 계층이 제 것을 갖는다** — 관리자 계층에도 같은 이름이 있지만
          공유하지 않는다(계층을 나눈 뜻이 그것이다). 읽기 저장소만 @hansapp/data 것을 쓴다.
        */
        { provide: SETTING_KEYRING, useValue: buildSettingKeyring(source) },
        {
          provide: SettingCache,
          useFactory: (repo: SettingReadRepository, keyring: SecretBoxKeys | undefined) =>
            new SettingCache(repo, keyring),
          inject: [SettingReadRepository, SETTING_KEYRING],
        },
        MailSettingsSource,
        { provide: EMAIL_SETTINGS_SOURCE, useExisting: MailSettingsSource },
        EmailSender,
        { provide: OTP_CONFIG, useValue: otpConfig },
        // 이메일 인증 코드(OTP) 발급·검증 + 메일 발송
        EmailVerificationRepository,
        EmailVerificationService,
        AuthEmailService,
        // AccessCache 는 설정 전체가 아니라 캐시 TTL 조각만 받는다.
        { provide: ACCESS_CACHE_CONFIG, useValue: config.accessCache },
        // 세션 캐시도 같은 규칙으로 자기 조각만 받는다.
        { provide: SESSION_CACHE_CONFIG, useValue: config.sessionCache },
        { provide: PROFILE_CACHE_CONFIG, useValue: config.profileCache },
        // 저장소(DB 접근). 서비스 내부 의존이라 export 하지 않는다.
        UserRepository,
        UserOAuthRepository,
        UserConsentRepository,
        TokenSessionRepository,
        AuthCodeRepository,
        WithdrawalRepository,
        // 서비스/가드
        AuthLogService,
        JwtKeyService,
        TokenService,
        // 로그인 완결(세션 발급 + 로그). 모든 로그인 경로가 지난다.
        LoginService,
        AuthService,
        ConsentService,
        SessionTrimService,
        // 로그인 이벤트 처리기. 이 모듈을 등록한 프로세스가 소비자가 된다
        // (EventConsumerModule 도 함께 등록해야 실제로 워커가 뜬다).
        SessionTrimHandler,
        // 세션 캐시(가드가 요청마다 본다) + 폐기 이벤트로 자기 메모리를 비우는 처리기.
        SessionCache,
        SessionCacheHandler,
        // /users/me 응답 캐시. 공개 API 라 호출 빈도를 우리가 정하지 못한다.
        ProfileCache,
        ProfileCacheHandler,
        OAuthTokenService,
        AuthGuard,
        FirstPartyGuard,
        // 소셜
        SocialTicketService,
        SocialService,
        SocialAuthGuard,
        SocialStrategyFactory,
        // 앱(개발자 플랫폼)
        AppRepository,
        AppService,
        // 앱이 등록한 LLM 업체 키(BYOK). 마스터 키가 없으면 저장 경로만 막힌다.
        { provide: APP_SECRET_CONFIG, useValue: buildAppSecretConfig(source) },
        LlmKeyRepository,
        LlmKeyService,
        // API 접근 인증(서비스 키/클라이언트) + 조회 캐시
        AccessCache,
        ApiAccessService,
      ],
      exports: [
        AUTH_CONFIG,
        MAIL_CONFIG,
        EmailVerificationService,
        JwtKeyService,
        TokenService,
        AuthService,
        // AuthController(AppModule 소속)가 주입받으므로 export 가 필요하다 —
        // providers 에만 있으면 이 모듈 안에서만 보인다.
        ConsentService,
        SessionTrimService,
        SessionCache,
        ProfileCache,
        OAuthTokenService,
        AuthLogService,
        AuthGuard,
        FirstPartyGuard,
        SocialService,
        SocialAuthGuard,
        SocialTicketService,
        // SocialAuthGuard(passport)는 @UseGuards 로 AppModule 컨트롤러에서 생성되므로
        // 그 의존이 모두 export 돼 있어야 한다
        // (AUTH_CONFIG·SocialTicketService·AccessCache·SocialStrategyFactory).
        AccessCache,
        SocialStrategyFactory,
        AppService,
        LlmKeyService,
        ApiAccessService,
      ],
    };
  }
}
