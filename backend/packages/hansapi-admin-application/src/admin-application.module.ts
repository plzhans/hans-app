import { DynamicModule, Module } from '@nestjs/common';
import { EnvSource } from '@hansapi/common';
import { ApplicationModule } from '@hansapi/application';
import { DataModule } from '@hansapi/data';

import { HiraCodeReadService } from './hira/hira-code-read.service';
import { HiraDetailSyncService } from './hira/hira-detail-sync.service';
import { HiraStageService } from './hira/hira-stage.service';
import { HiraSubjectSyncService } from './hira/hira-subject-sync.service';
import { HiraCodeSyncService } from './hira/hira-code-sync.service';
import { HiraHospitalSyncService } from './hira/hira-hospital-sync.service';
import { HiraHospitalReadService } from './hira/hira-hospital-read.service';
import { HiraQueryService } from './hira/hira-query.service';
import { buildKrDataConfig, KRDATA_CONFIG } from './krdata.config';
import { krDataProviders } from './krdata.providers';
import { NmcCodeReadService } from './nmc/nmc-code-read.service';
import { NmcBabySyncService } from './nmc/nmc-baby-sync.service';
import { NmcBasicSyncService } from './nmc/nmc-basic-sync.service';
import { NmcStageService } from './nmc/nmc-stage.service';
import { NmcSubjectSyncService } from './nmc/nmc-subject-sync.service';
import { HealthcareBuildService } from './healthcare/healthcare-build.service';
import { HealthcareDetailBuildService } from './healthcare/healthcare-detail-build.service';
import { HealthcareCodeSeedService } from './healthcare/healthcare-code-seed.service';
import { HiraNmcMatchService } from './match/hira-nmc-match.service';
import { SyncRunnerService } from './common/sync-runner.service';
import { SyncStateService } from './common/sync-state.service';
import { NmcCodeSyncService } from './nmc/nmc-code-sync.service';
import { NmcHospitalSyncService } from './nmc/nmc-hospital-sync.service';
import { NmcHospitalReadService } from './nmc/nmc-hospital-read.service';
import { NmcQueryService } from './nmc/nmc-query.service';

/**
 * 관리자·배치 전용 응용 계층의 DI 진입점.
 *
 * hansapi-server(게이트웨이)는 이 모듈을 참조하지 않는다. 서버는 로컬 DB 만 읽고,
 * 외부 공공데이터 API 를 직접 호출하는 것은 이 계층뿐이다. 콜수 제한이 걸린 API 를
 * 서버가 실수로 때리는 사고를 의존성 그래프로 막는다.
 *
 * 지금은 hansapi-cli 가 사용하며, 추후 hansapi-admin-server 가 같은 모듈을 import 한다.
 */
@Module({})
export class AdminApplicationModule {
  static forRoot(source: EnvSource): DynamicModule {
    const config = buildKrDataConfig(source);

    return {
      module: AdminApplicationModule,
      // DB 조회는 application 계층(NmcHospitalService 등)이 소유한다. 여기서 재사용한다.
      imports: [DataModule.forRoot(source), ApplicationModule.forRoot(source)],
      providers: [
        { provide: KRDATA_CONFIG, useValue: config },
        ...krDataProviders,
        NmcHospitalSyncService,
        HiraHospitalSyncService,
        NmcCodeSyncService,
        HiraCodeSyncService,
        NmcQueryService,
        HiraQueryService,
        NmcHospitalReadService,
        HiraHospitalReadService,
        NmcCodeReadService,
        HiraCodeReadService,
        SyncStateService,
        NmcSubjectSyncService,
        HiraSubjectSyncService,
        NmcBabySyncService,
        NmcBasicSyncService,
        HiraDetailSyncService,
        NmcStageService,
        HiraStageService,
        SyncRunnerService,
        HiraNmcMatchService,
        HealthcareCodeSeedService,
        HealthcareBuildService,
        HealthcareDetailBuildService,
      ],
      // SDK 클라이언트는 export 하지 않는다. 외부 API 호출은 이 계층 안에 가둔다.
      exports: [
        NmcHospitalSyncService,
        HiraHospitalSyncService,
        NmcCodeSyncService,
        HiraCodeSyncService,
        NmcQueryService,
        HiraQueryService,
        NmcHospitalReadService,
        HiraHospitalReadService,
        NmcCodeReadService,
        HiraCodeReadService,
        SyncStateService,
        NmcStageService,
        HiraStageService,
        SyncRunnerService,
        HiraNmcMatchService,
        HealthcareCodeSeedService,
        HealthcareBuildService,
        HealthcareDetailBuildService,
      ],
    };
  }
}
