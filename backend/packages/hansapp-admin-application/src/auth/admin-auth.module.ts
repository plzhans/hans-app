import { DynamicModule, Module } from '@nestjs/common';
import type { ConfigSource, SecretBoxKeys } from '@hansapp/common';
import { SETTING_KEYRING, buildSettingKeyring } from '@hansapp/common';

import { DataModule, SettingReadRepository } from '@hansapp/data';

import { ADMIN_AUTH_CONFIG, buildAdminAuthConfig } from './admin-auth.config';
import { AdminAccountService } from './admin-account.service';
import { AdminActionLogService } from './admin-action-log.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtService } from './admin-jwt.service';
import { AdminLoginService } from './admin-login.service';
import { AdminPasswordResetRepository } from './admin-password-reset.repository';
import { AdminPasswordResetService } from './admin-password-reset.service';
import { AdminProfileCache } from './admin-profile-cache.service';
import { AdminSessionCache } from './admin-session-cache.service';
import { AdminSessionPurgeService } from './admin-session-purge.service';
import { AdminSessionRepository } from './admin-session.repository';
import { AdminTokenService } from './admin-token.service';
import { AdminUserRepository } from './admin-user.repository';
import { SettingCache } from '../setting/setting-cache.service';
import { AdminGoogleClient } from './social/admin-google.client';
import { AdminOAuthRepository } from './social/admin-oauth.repository';
import { AdminSocialService } from './social/admin-social.service';
import { AdminSocialTicketService } from './social/admin-social-ticket.service';

/**
 * 관리자 인증 모듈.
 *
 * **AdminApplicationModule 과 일부러 갈라 둔다.** 배치·CLI 는 admin 응용 계층을 통째로
 * import 하는데, 인증을 거기 섞으면 그 프로세스들도 bcryptjs·@nestjs/jwt 를 지고 뜬다.
 * 인증이 필요한 것은 hansapp-admin-api 하나뿐이라 그쪽만 이 모듈을 가져간다.
 *
 * 같은 이유로 패키지 배럴(src/index.ts)에도 넣지 않는다 — CJS 배럴은 평가할 때 re-export
 * 대상을 전부 require 하므로, 넣는 순간 위 회피가 무의미해진다. `@hansapp/admin-application/auth`
 * 서브패스로만 닿는다.
 */
@Module({})
export class AdminAuthModule {
  static forRoot(source: ConfigSource): DynamicModule {
    const config = buildAdminAuthConfig(source);

    return {
      module: AdminAuthModule,
      imports: [DataModule.forRoot(source)],
      providers: [
        { provide: ADMIN_AUTH_CONFIG, useValue: config },
        // 저장소(DB 접근). 서비스 내부 의존이라 export 하지 않는다.
        AdminUserRepository,
        AdminSessionRepository,
        AdminPasswordResetRepository,
        /*
          세션 캐시. **가드와 토큰 서비스가 같은 인스턴스를 봐야 한다** — 한쪽이 끊으면서
          지운 칸을 다른 쪽이 곧바로 못 보면, 끊긴 토큰이 캐시 수명만큼 그대로 통과한다.
          CacheModule 이 없는 프로세스에서는 캐시 없이 돈다(@Optional CACHE_MANAGER).
        */
        AdminSessionCache,
        // 내 정보 응답 캐시. 값이 바뀌는 자리들이 이걸 직접 지운다.
        AdminProfileCache,
        // 정비 화면의 "관리자 전체 로그아웃". 세션과 그 캐시를 한 번에 비운다.
        AdminSessionPurgeService,
        AdminJwtService,
        AdminTokenService,
        AdminActionLogService,
        AdminLoginService,
        AdminAuthService,
        // 관리자 계정 관리(콘솔). 계정·세션 저장소를 함께 봐야 해서 이 모듈에 둔다.
        AdminAccountService,
        // 로그인 화면의 "비밀번호 찾기". 인증 전에 도는 흐름이라 여기 둔다.
        AdminPasswordResetService,
        // 가드는 providers 와 exports 양쪽에 둔다 — 앱이 APP_GUARD 에 useExisting 으로
        // 같은 인스턴스를 재사용해야 한다(useClass 로 두면 DI 가 앱 스코프에서 다시 풀린다).
        AdminAuthGuard,
        /*
          소셜 로그인(구글). **설정 캐시를 이 모듈이 직접 든다** — 자격증명이 DB(env_setting)에
          있는데, AdminApplicationModule 을 끌어오면 이 모듈을 갈라 둔 이유(배치·CLI 가 인증
          의존성을 지지 않게 한다)가 무너진다. 캐시는 DB 사본을 5분 들고 있을 뿐이라
          인스턴스가 하나 더 생겨도 값이 갈리지 않는다.
        */
        { provide: SETTING_KEYRING, useValue: buildSettingKeyring(source) },
        {
          provide: SettingCache,
          useFactory: (repo: SettingReadRepository, keyring: SecretBoxKeys | undefined) =>
            new SettingCache(repo, keyring),
          inject: [SettingReadRepository, SETTING_KEYRING],
        },
        AdminOAuthRepository,
        AdminGoogleClient,
        AdminSocialTicketService,
        AdminSocialService,
      ],
      exports: [
        ADMIN_AUTH_CONFIG,
        AdminAuthService,
        AdminAccountService,
        AdminPasswordResetService,
        AdminTokenService,
        AdminActionLogService,
        AdminAuthGuard,
        // 콘솔의 캐시 화면이 직접 들여다보고 지운다(회원 쪽 UserSessionCacheAdmin 과 같은 자리).
        AdminSessionCache,
        AdminProfileCache,
        AdminSessionPurgeService,
        AdminSocialService,
        AdminGoogleClient,
        AdminSocialTicketService,
      ],
    };
  }
}
