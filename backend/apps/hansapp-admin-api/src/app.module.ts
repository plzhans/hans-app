import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import type { ConfigSource } from '@hansapp/common';
import { AdminApplicationModule } from '@hansapp/admin-application';
import {
  AdminAuthGuard,
  AdminAuthModule,
} from '@hansapp/admin-application/auth';
import { resolveClientIp } from '@hansapp/http-common';

import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminBootstrapService } from './auth/admin-bootstrap.service';
import { SyncStateController } from './admin/sync-state.controller';
import { HealthController } from './health/health.controller';
import { UserController } from './user/user.controller';
import { AppController } from './apps/app.controller';
import { SettingController } from './setting/setting.controller';
import { EnvLlmKeyController } from './llm/env-llm-key.controller';
import { EnvLlmModelController } from './llm/env-llm-model.controller';
import { AuthLogController } from './logs/auth-log.controller';
import { LlmUsageLogController } from './logs/llm-usage-log.controller';

@Module({})
export class AppModule {
  static forRoot(config: ConfigSource): DynamicModule {
    const clientIpHeader =
      config.getStringOrDefault('apps-admin-api.proxy.clientIpHeader') ||
      undefined;

    return {
      module: AppModule,
      imports: [
        SentryModule.forRoot(),
        // 관리자 업무 로직. 배치·CLI 가 쓰는 것과 같은 계층이다.
        AdminApplicationModule.forRoot(config),
        // 인증. **AdminApplicationModule 과 별개 모듈이다** — 배치·CLI 는 이걸 가져가지 않는다.
        AdminAuthModule.forRoot(config),
        /*
          **이벤트 모듈(EventPublisher/EventConsumer)을 넣지 않는다.**
          큐가 하나라 두 프로세스가 동시에 소비하면 잡이 어느 쪽으로 갈지 정할 수 없다.
          소비는 hansapp-api 가 한다.
        */
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 300 }],
          // 프록시 뒤에서 전부 한 IP 로 묶이지 않게 실제 클라 IP 로 버킷을 나눈다.
          getTracker: (req: Record<string, unknown>) =>
            Promise.resolve(resolveClientIp(req, clientIpHeader)),
        }),
      ],
      controllers: [
        AdminAuthController,
        HealthController,
        SyncStateController,
        UserController,
        AppController,
        SettingController,
        EnvLlmKeyController,
        EnvLlmModelController,
        LlmUsageLogController,
        AuthLogController,
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
