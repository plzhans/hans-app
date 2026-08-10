import { DynamicModule, Module } from '@nestjs/common';
import type { ConfigSource } from '@hansapp/common';
import { DataModule } from '@hansapp/data';

import { ADMIN_AUTH_CONFIG, buildAdminAuthConfig } from './admin-auth.config';
import { AdminActionLogService } from './admin-action-log.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtService } from './admin-jwt.service';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionRepository } from './admin-session.repository';
import { AdminTokenService } from './admin-token.service';
import { AdminUserRepository } from './admin-user.repository';

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
        AdminJwtService,
        AdminTokenService,
        AdminActionLogService,
        AdminLoginService,
        AdminAuthService,
        // 가드는 providers 와 exports 양쪽에 둔다 — 앱이 APP_GUARD 에 useExisting 으로
        // 같은 인스턴스를 재사용해야 한다(useClass 로 두면 DI 가 앱 스코프에서 다시 풀린다).
        AdminAuthGuard,
      ],
      exports: [
        ADMIN_AUTH_CONFIG,
        AdminAuthService,
        AdminTokenService,
        AdminActionLogService,
        AdminAuthGuard,
      ],
    };
  }
}
