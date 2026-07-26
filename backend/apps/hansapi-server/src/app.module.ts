import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EnvSource, optionalString } from '@hansapi/common';
import { ApplicationModule } from '@hansapi/application';
import {
  AuthModule,
  AuthGuard,
  FirstPartyGuard,
} from '@hansapi/auth-application';
import { NtsClient } from '@kr-go/nts';
import { JusoClient } from '@kr-go/juso';

import { resolveClientIp } from './common/client-ip';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { SocialController } from './auth/social.controller';
import { OAuthController } from './oauth/oauth.controller';
import { JwksController } from './oauth/jwks.controller';
import { AppsController } from './apps/app.controller';
import { AddressController } from './address/address.controller';
import { AddressService } from './address/address.service';
import { BusinessController } from './business/business.controller';
import { BusinessService } from './business/business.service';
import { HiraCodeController } from './datagokr/hira/hira-code.controller';
import { HiraRegionController } from './datagokr/hira/hira-region.controller';
import { HiraHospitalController } from './datagokr/hira/hira-hospital.controller';
import { NmcBabyController } from './datagokr/nmc/nmc-baby.controller';
import { NmcCodeController } from './datagokr/nmc/nmc-code.controller';
import { NmcRegionController } from './datagokr/nmc/nmc-region.controller';
import { NmcHospitalController } from './datagokr/nmc/nmc-hospital.controller';
import { HealthcareHospitalController } from './healthcare/hospital.controller';
import { HealthcareMetaController } from './healthcare/meta.controller';
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
  static forRoot(source: EnvSource): DynamicModule {
    // rate limit 이 IP 버킷 키로 쓸 "진짜 클라 IP" 를 어느 헤더에서 뽑을지 env 로 고른다.
    // 인프라(Cloudflare/CloudFront/OCI/nginx)가 아직 미정이라 provider 별 헤더를 env 로만 바꾼다.
    //   Cloudflare  → cf-connecting-ip,  범용 프록시 → 비우고 TRUST_PROXY 로 req.ip 사용
    const clientIpHeader = optionalString(source, 'CLIENT_IP_HEADER');
    return {
      module: AppModule,
      imports: [
        ApplicationModule.forRoot(source),
        AuthModule.forRoot(source),
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
        JwksController,
        AppsController,
        HiraHospitalController,
        NmcHospitalController,
        HiraCodeController,
        NmcCodeController,
        HiraRegionController,
        NmcRegionController,
        NmcBabyController,
        HealthcareHospitalController,
        HealthcareMetaController,
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
        BusinessService,
        AddressService,
        // 외부 API 클라이언트. **이 서버에서 외부(국세청·도로명주소)를 직접 호출하는 소수의 API 용이다.**
        // 나머지 API 는 로컬 DB 미러를 읽는다.
        //
        // 인증키는 optionalString 이라 **키가 없어도 서버는 뜬다** — 해당 엔드포인트를 호출할 때만
        // 실패한다. 서버는 서비스키 없이도 부팅한다는 불변식을 지키기 위해서다.
        // NTS 는 data.go.kr(odcloud) serviceKey(KRDATA_SERVICE_KEY)를, JUSO 는 confmKey(KRGO_JUSO_SERVICE_KEY)를 쓴다.
        {
          provide: NtsClient,
          useFactory: (): NtsClient =>
            new NtsClient({
              serviceKey: optionalString(source, 'KRDATA_SERVICE_KEY') ?? '',
            }),
        },
        {
          provide: JusoClient,
          useFactory: (): JusoClient =>
            new JusoClient({
              confmKey: optionalString(source, 'KRGO_JUSO_SERVICE_KEY') ?? '',
            }),
        },
      ],
    };
  }
}
