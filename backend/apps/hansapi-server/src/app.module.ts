import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EnvSource } from '@hansapi/common';
import { ApplicationModule } from '@hansapi/application';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './auth/auth.guard';
import { HiraCodeController } from './datagokr/hira/hira-code.controller';
import { HiraRegionController } from './datagokr/hira/hira-region.controller';
import { HiraHospitalController } from './datagokr/hira/hira-hospital.controller';
import { NmcBabyController } from './datagokr/nmc/nmc-baby.controller';
import { NmcCodeController } from './datagokr/nmc/nmc-code.controller';
import { NmcRegionController } from './datagokr/nmc/nmc-region.controller';
import { NmcHospitalController } from './datagokr/nmc/nmc-hospital.controller';
import { HealthcareHospitalController } from './healthcare/hospital.controller';
import { HealthcareMetaController } from './healthcare/meta.controller';

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
      imports: [ApplicationModule.forRoot(source)],
      controllers: [
        AppController,
        HiraHospitalController,
        NmcHospitalController,
        HiraCodeController,
        NmcCodeController,
        HiraRegionController,
        NmcRegionController,
        NmcBabyController,
        HealthcareHospitalController,
        HealthcareMetaController,
      ],
      providers: [
        AppService,
        // 전역 인증 가드. @Public() 라우트는 우회한다.
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    };
  }
}
