import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import type { ConfigSource } from '@hansapp/common';
import { AdminApplicationModule } from '@hansapp/admin-application';
import { EventPublisherModule } from '@hansapp/event-publisher';
import { AdminAuthGuard, AdminAuthModule, AdminJwtService } from '@hansapp/admin-application/auth';
import { resolveClientIp } from '@hansapp/http-common';

import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminSocialController } from './auth/admin-social.controller';
import { AdminDiscoveryController } from './auth/admin-discovery.controller';
import { AdminBootstrapService } from './auth/admin-bootstrap.service';
import { AdminMeController } from './admins/admin-me.controller';
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
import { BatchRunController } from './logs/batch-run.controller';
import { BatchRunnerClient } from './logs/batch-runner.client';
import { BoardController } from './community/board.controller';
import { BoardPostController } from './community/board-post.controller';
import { LlmUsageLogController } from './logs/llm-usage-log.controller';
import { HospitalController } from './healthcare/hospital.controller';
import { HiraMirrorController } from './integrations/hira-mirror.controller';
import { NmcMirrorController } from './integrations/nmc-mirror.controller';

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
        // discovery(`/.well-known/openid-configuration`). 인증 경로와 같은 묶음이라 여기 둔다.
        AdminDiscoveryController,
        /*
          **AdminAccountController 보다 먼저 등록한다.** 두 컨트롤러가 같은 접두사를
          쓰는데(`/api/admins`), 라우트는 등록 순서대로 매칭되므로 뒤에 서면
          `/api/admins/me` 가 그쪽의 `:id` 에 잡혀 400 이 된다.
        */
        AdminMeController,
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
        BatchRunController,
        BoardController,
        BoardPostController,
        HospitalController,
        HiraMirrorController,
        NmcMirrorController,
      ],
      providers: [
        // 폭주 요청을 인증 처리 전에 값싸게 쳐내려면 이쪽이 먼저다.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        // 전역 인증 가드. @AdminPublic() 라우트는 우회한다.
        // 가드 본체는 AdminAuthModule 이 제공·export 하므로 인스턴스를 재사용한다(useExisting).
        { provide: APP_GUARD, useExisting: AdminAuthGuard },
        /*
          배치 프로세스를 부르는 쪽("지금 실행").

          **주소는 배치가 선언한 것을 읽는다**(apps-batch.externalUrl). 부르는 쪽에 사본을 두면
          배치가 주소를 옮길 때 두 곳을 고쳐야 하고, 한쪽만 고치면 조용히 못 붙는다.
          배치도 같은 방식으로 관리자 주소를 admin.jwt.issuer 에서 읽는다.

          설정을 여기서 읽어 넣어 주는 것은, 어느 앱이 무엇을 읽는지가 이 자리에 모여 있어야
          하기 때문이다 — 클라이언트가 ConfigSource 를 직접 들면 설정 키가 코드에 흩어진다.
        */
        {
          provide: BatchRunnerClient,
          inject: [AdminJwtService],
          useFactory: (jwt: AdminJwtService) =>
            new BatchRunnerClient(config.getStringOrDefault('apps-batch.externalUrl'), jwt),
        },
        // 부팅 시 관리자 계정이 없으면 기본 계정을 만든다(local·develop 전용).
        // **앱 계층에 두는 이유**는 이 동작이 "서버가 뜰 때" 로 한정돼야 하기 때문이다 —
        // AdminAuthModule 은 CLI 도 띄운다.
        AdminBootstrapService,
      ],
    };
  }
}
