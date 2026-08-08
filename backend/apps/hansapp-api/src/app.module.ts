import { DynamicModule, Module } from '@nestjs/common';
import { EventPublisherModule } from '@hansapp/event-publisher';
import { EventConsumerModule } from '@hansapp/event-consumer';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import type { ConfigSource } from '@hansapp/common';
import { ApplicationModule } from '@hansapp/application';
import { HealthcareMcpServer } from '@hansapp/mcp';
import {
  AuthModule,
  AuthGuard,
  FirstPartyGuard,
} from '@hansapp/auth-application';
import { resolveClientIp } from '@hansapp/http-common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { SocialController } from './auth/social.controller';
import { OAuthController } from './oauth/oauth.controller';
import { UserController } from './users/user.controller';
import { HealthController } from './health/health.controller';
import { JwksController } from './oauth/jwks.controller';
import { AppsController } from './apps/app.controller';
import { LlmKeyController } from './apps/llm-key.controller';
import { AddressController } from './address/address.controller';
import { BusinessController } from './business/business.controller';
import { HiraCodeController } from './datagokr/hira/hira-code.controller';
import { HiraRegionController } from './datagokr/hira/hira-region.controller';
import { HiraHospitalController } from './datagokr/hira/hira-hospital.controller';
import { NmcBabyController } from './datagokr/nmc/nmc-baby.controller';
import { NmcCodeController } from './datagokr/nmc/nmc-code.controller';
import { NmcRegionController } from './datagokr/nmc/nmc-region.controller';
import { NmcHospitalController } from './datagokr/nmc/nmc-hospital.controller';
import { HealthcareHospitalController } from './healthcare/hospital.controller';
import { HealthcareMetaController } from './healthcare/meta.controller';
import { HealthcareAiSearchController } from './healthcare/ai-search.controller';
import { AiCapabilitiesController } from './ai/capabilities.controller';
import { HealthcareMcpController } from './mcp/healthcare-mcp.controller';
import { TransportController } from './transport/transport.controller';
import { RegionController } from './region/region.controller';

/**
 * 게이트웨이 서버의 루트 모듈.
 *
 * 설정을 EnvSource 로 받아 하위 계층에 내려준다. 각 계층이 자기 설정을 스스로 뽑고 검증하므로
 * 서버는 DB 설정도 서비스키도 직접 알지 못한다. 필요한 설정이 없으면 부팅 시점에 실패한다.
 */
@Module({})
export class AppModule {
  static forRoot(config: ConfigSource): DynamicModule {
    // rate limit 이 IP 버킷 키로 쓸 "진짜 클라 IP" 를 어느 헤더에서 뽑을지 설정으로 고른다.
    // 인프라(Cloudflare/CloudFront/OCI/nginx)가 아직 미정이라 provider 별 헤더를 설정으로만 바꾼다.
    //   Cloudflare  → cf-connecting-ip,  범용 프록시 → 비우고 TRUST_PROXY 로 req.ip 사용
    // 비밀 아닌 값이라 config/config.yaml(또는 CLIENT_IP_HEADER 환경변수)로 관리한다.
    const clientIpHeader =
      config.getStringOrDefault('apps-api.proxy.clientIpHeader') || undefined;
    return {
      module: AppModule,
      imports: [
        // Sentry 를 Nest 계층에 연결한다(가드·인터셉터·핸들러 스팬, 요청 컨텍스트).
        // Sentry.init 은 instrument.ts 가 이미 끝냈다 — 이 모듈은 "Nest 쪽 배선" 만 한다.
        // DSN 이 없어 init 을 건너뛴 경우에도 안전하다(전부 no-op).
        SentryModule.forRoot(),
        // 도메인 이벤트 발행(전역). 로그인 뒤에 붙는 일들이 응답 경로 밖에서 돌게 한다.
        EventPublisherModule.forRoot(config),
        /*
          **지금은 API 가 소비도 한다.** 처리기는 AuthModule 이 갖고 있고, 이 모듈이 워커를
          띄운다. 나중에 전용 소비 서버로 옮기려면 그 서버가 이 둘(AuthModule·EventConsumerModule)
          을 등록하고 여기서는 이 줄만 지우면 된다.

          **두 프로세스가 동시에 소비하면 안 된다.** 큐가 하나라 잡이 어느 워커로 갈지
          정할 수 없다 — 옮길 때는 겹치지 않게 한쪽을 먼저 내린다.
        */
        EventConsumerModule.forRoot(config),
        ApplicationModule.forRoot(config),
        AuthModule.forRoot(config),
        // 전역 rate limit. 라이브러리 기본 저장소는 인메모리(인스턴스별) 다 —
        // 단일 인스턴스면 그대로 충분하고, 수평 확장 시 @nest-lab/throttler-storage-redis 로 교체한다.
        // 여기 값은 "안전망(폭주 방지)" 용 느슨한 전역 한도이고, 민감 라우트(/oauth/token 등)는
        // 컨트롤러에서 @Throttle 로 더 조인다.
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 300 }], // IP 당 60초에 300회
          // IP 인식을 env 로 고른 헤더 기준으로 통일한다(provider 교체 시 코드 불변).
          getTracker: (req: Record<string, unknown>): string =>
            resolveClientIp(req, clientIpHeader),
        }),
      ],
      controllers: [
        AppController,
        AuthController,
        SocialController,
        OAuthController,
        UserController,
        HealthController,
        JwksController,
        AppsController,
        LlmKeyController,
        HiraHospitalController,
        NmcHospitalController,
        HiraCodeController,
        NmcCodeController,
        HiraRegionController,
        NmcRegionController,
        NmcBabyController,
        HealthcareHospitalController,
        HealthcareMetaController,
        HealthcareAiSearchController,
        AiCapabilitiesController,
        HealthcareMcpController,
        TransportController,
        RegionController,
        BusinessController,
        AddressController,
      ],
      providers: [
        AppService,
        // 전역 rate limit 가드. 가장 먼저 등록해 인증 처리 전에 폭주 요청을 값싸게 쳐낸다.
        // @Public 여부와 무관하게 전 라우트에 적용된다(@SkipThrottle 로 개별 제외 가능).
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        // 전역 오리진 가드. @FirstPartyOnly() 라우트(쿠키·토큰을 다루는 1st-party 흐름)만
        // Origin 을 화이트리스트로 검사한다. @Public 여부와 무관하게 동작하므로 먼저 등록한다.
        { provide: APP_GUARD, useExisting: FirstPartyGuard },
        // 전역 인증 가드. @Public() 라우트는 우회한다.
        // 가드 본체는 AuthModule 이 제공·export 하므로 인스턴스를 재사용한다(useExisting).
        { provide: APP_GUARD, useExisting: AuthGuard },
        // MCP 도구 서버. **모듈이 아니라 여기 프로바이더로 둔다** — 도구가 부르는 서비스
        // (HealthcareHospitalService 등)는 위에서 import 한 ApplicationModule 이 export 하는데,
        // 별도 모듈로 감싸면 그쪽에서 ApplicationModule.forRoot 를 또 불러야 하고 그러면
        // Prisma 풀·코드 캐시가 두 벌 뜬다. 도구 정의 자체는 @hansapp/mcp 가 소유한다.
        HealthcareMcpServer,
        /*
          외부 API(국세청·도로명주소)를 부르는 서비스와 클라이언트는 여기 없다 —
          ApplicationModule 이 갖는다. 서비스키가 DB(env_setting)에 있어 클라이언트를
          부팅 때 만들 수 없고, 만들 이유도 없다(팩토리가 호출 시점에 만든다).

          키가 없어도 서버는 뜬다는 방침은 그대로다. 없으면 그 API 를 부르는 순간 503 이다.
        */
      ],
    };
  }
}
