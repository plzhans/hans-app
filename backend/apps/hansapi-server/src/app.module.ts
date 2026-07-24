import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EnvSource, optionalString } from '@hansapi/common';
import { ApplicationModule } from '@hansapi/application';
import {
  AuthModule,
  AuthGuard,
  FirstPartyGuard,
} from '@hansapi/auth-application';
import { NtsClient } from '@kr-go/nts';
import { JusoClient } from '@kr-go/juso';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { SocialController } from './auth/social.controller';
import { OAuthController } from './oauth/oauth.controller';
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
    return {
      module: AppModule,
      imports: [ApplicationModule.forRoot(source), AuthModule.forRoot(source)],
      controllers: [
        AppController,
        AuthController,
        SocialController,
        OAuthController,
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
