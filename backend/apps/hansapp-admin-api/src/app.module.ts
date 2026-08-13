import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import type { ConfigSource } from '@hansapp/common';
import { AdminApplicationModule } from '@hansapp/admin-application';
import { EventPublisherModule } from '@hansapp/event-publisher';
import { AdminAuthGuard, AdminAuthModule } from '@hansapp/admin-application/auth';
import { resolveClientIp } from '@hansapp/http-common';

import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminSocialController } from './auth/admin-social.controller';
import { AdminBootstrapService } from './auth/admin-bootstrap.service';
import { AdminAccountController } from './admins/admin-account.controller';
import { SyncStateController } from './admin/sync-state.controller';
import { MaintenanceController } from './admin/maintenance.controller';
import { HealthController } from './health/health.controller';
import { UserController } from './user/user.controller';
import { AppController } from './apps/app.controller';
import { SettingController } from './setting/setting.controller';
import { EnvLlmKeyController } from './llm/env-llm-key.controller';
import { EnvLlmModelController } from './llm/env-llm-model.controller';
import { AuthLogController } from './logs/auth-log.controller';
import { BoardController } from './community/board.controller';
import { BoardPostController } from './community/board-post.controller';
import { LlmUsageLogController } from './logs/llm-usage-log.controller';

@Module({})
export class AppModule {
  static forRoot(config: ConfigSource): DynamicModule {
    const clientIpHeader =
      config.getStringOrDefault('apps-admin-api.proxy.clientIpHeader') || undefined;

    return {
      module: AppModule,
      imports: [
        SentryModule.forRoot(),
        // 관리자 업무 로직. 배치·CLI 가 쓰는 것과 같은 계층이다.
        AdminApplicationModule.forRoot(config),
        // 인증. **AdminApplicationModule 과 별개 모듈이다** — 배치·CLI 는 이걸 가져가지 않는다.
        AdminAuthModule.forRoot(config),
        /*
          **발행만 한다. 소비는 하지 않는다.**

          큐가 하나라 두 프로세스가 동시에 소비하면 잡이 어느 쪽으로 갈지 정할 수 없다 —
          소비는 hansapp-api 가 맡는다(EventConsumerModule 은 그쪽에만 있다).

          발행은 사정이 다르다. 관리자가 세션을 끊으면 그 사실을 인증 계층이 알아야
          캐시를 비운다 — 콘솔이 남의 캐시를 직접 건드리는 대신 이벤트로 알린다.
        */
        EventPublisherModule.forRoot(config),
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 300 }],
          // 프록시 뒤에서 전부 한 IP 로 묶이지 않게 실제 클라 IP 로 버킷을 나눈다.
          getTracker: (req: Record<string, unknown>) =>
            Promise.resolve(resolveClientIp(req, clientIpHeader)),
        }),
      ],
      controllers: [
        AdminAuthController,
        // 소셜 로그인. **AdminAuthController 뒤에 둔다** — 라우트가 겹치지는 않지만
        // `/auth` 아래의 인증 경로가 한자리에 모여 있어야 읽힌다.
        AdminSocialController,
        AdminAccountController,
        HealthController,
        SyncStateController,
        MaintenanceController,
        UserController,
        AppController,
        SettingController,
        EnvLlmKeyController,
        EnvLlmModelController,
        LlmUsageLogController,
        AuthLogController,
        BoardController,
        BoardPostController,
      ],
      providers: [
        // 폭주 요청을 인증 처리 전에 값싸게 쳐내려면 이쪽이 먼저다.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        // 전역 인증 가드. @AdminPublic() 라우트는 우회한다.
        // 가드 본체는 AdminAuthModule 이 제공·export 하므로 인스턴스를 재사용한다(useExisting).
        { provide: APP_GUARD, useExisting: AdminAuthGuard },
        // 부팅 시 관리자 계정이 없으면 기본 계정을 만든다(local·develop 전용).
        // **앱 계층에 두는 이유**는 이 동작이 "서버가 뜰 때" 로 한정돼야 하기 때문이다 —
        // AdminAuthModule 은 CLI 도 띄운다.
        AdminBootstrapService,
      ],
    };
  }
}
