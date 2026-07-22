import { DynamicModule, Module } from '@nestjs/common';
import { EnvSource } from '@hansapi/common';
import { ApplicationModule } from '@hansapi/application';
import { DataModule } from '@hansapi/data';
import { SearchModule } from '@hansapi/search';

import { HiraCodeReadService } from './hira/hira-code-read.service';
import { HiraCodeSeedService } from './hira/hira-code-seed.service';
import { HiraDetailSyncService } from './hira/hira-detail-sync.service';
import { HiraHospitalSyncRepository } from './hira/hira-hospital-sync.repository';
import { NmcBasicSyncRepository } from './nmc/nmc-basic-sync.repository';
import { NmcBabySyncRepository } from './nmc/nmc-baby-sync.repository';
import { NmcCodeSyncRepository } from './nmc/nmc-code-sync.repository';
import { NmcHospitalSyncRepository } from './nmc/nmc-hospital-sync.repository';
import { NmcSubjectSyncRepository } from './nmc/nmc-subject-sync.repository';
import { SyncStateRepository } from './common/sync-state.repository';
import { HiraNmcMatchRepository } from './match/hira-nmc-match.repository';
import { HospitalI18nExportRepository } from './i18n/hospital-i18n-export.repository';
import { HiraAssessmentSyncRepository } from './hira/hira-assessment-sync.repository';
import { HiraCodeSyncRepository } from './hira/hira-code-sync.repository';
import { HiraCodeSeedRepository } from './hira/hira-code-seed.repository';
import { HiraDetailSyncRepository } from './hira/hira-detail-sync.repository';
import { HiraNpaySyncRepository } from './hira/hira-npay-sync.repository';
import { HiraNpayCodeSyncRepository } from './hira/hira-npay-code-sync.repository';
import { HiraNpayWebSyncRepository } from './hira/hira-npay-web-sync.repository';
import { HiraSpecialtySyncRepository } from './hira/hira-specialty-sync.repository';
import { HiraSubjectSyncRepository } from './hira/hira-subject-sync.repository';
import { HealthcareCodeSeedRepository } from './healthcare/healthcare-code-seed.repository';
import { HealthcareBuildRepository } from './healthcare/healthcare-build.repository';
import { HealthcareDetailBuildRepository } from './healthcare/healthcare-detail-build.repository';
import { HealthcareIndexRepository } from './healthcare/healthcare-index.repository';
import { HealthcareIndexService } from './healthcare/healthcare-index.service';
import { HiraStageService } from './hira/hira-stage.service';
import { HiraAssessmentSyncService } from './hira/hira-assessment-sync.service';
import { HiraNpaySyncService } from './hira/hira-npay-sync.service';
import { HiraNpayCodeSyncService } from './hira/hira-npay-code-sync.service';
import { HiraNpayWebSyncService } from './hira/hira-npay-web-sync.service';
import { HiraSpecialtySyncService } from './hira/hira-specialty-sync.service';
import { HiraSubjectSyncService } from './hira/hira-subject-sync.service';
import { HiraCodeSyncService } from './hira/hira-code-sync.service';
import { HiraHospitalSyncService } from './hira/hira-hospital-sync.service';
import { HiraHospitalReadService } from './hira/hira-hospital-read.service';
import { HiraQueryService } from './hira/hira-query.service';
import { buildKrDataConfig, KRDATA_CONFIG } from './krdata.config';
import { krDataProviders } from './krdata.providers';
import { buildJusoConfig, JUSO_CONFIG } from './juso.config';
import { jusoProviders } from './juso.providers';
import { ntsProviders } from './nts.providers';
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
    const jusoConfig = buildJusoConfig(source);

    return {
      module: AdminApplicationModule,
      // DB 조회는 application 계층(NmcHospitalService 등)이 소유한다. 여기서 재사용한다.
      // SearchModule 은 ES 색인용이다 — 순수 ES(Prisma 무관)라 두 번째 DB 풀을 끌어오지 않는다.
      // ElasticsearchService 는 지연 연결이라 ES 가 죽어 있어도 부팅한다(색인 실행 때 드러난다).
      imports: [
        DataModule.forRoot(source),
        ApplicationModule.forRoot(source),
        SearchModule.forRoot(source),
      ],
      providers: [
        // 저장소(DB 접근). 서비스 내부 의존이라 export 하지 않는다.
        HiraHospitalSyncRepository,
        NmcBasicSyncRepository,
        NmcBabySyncRepository,
        NmcCodeSyncRepository,
        NmcHospitalSyncRepository,
        NmcSubjectSyncRepository,
        SyncStateRepository,
        HiraNmcMatchRepository,
        HospitalI18nExportRepository,
        HiraAssessmentSyncRepository,
        HiraCodeSyncRepository,
        HiraCodeSeedRepository,
        HiraDetailSyncRepository,
        HiraNpaySyncRepository,
        HiraNpayCodeSyncRepository,
        HiraNpayWebSyncRepository,
        HiraSpecialtySyncRepository,
        HiraSubjectSyncRepository,
        HealthcareCodeSeedRepository,
        HealthcareBuildRepository,
        HealthcareDetailBuildRepository,
        // ES 색인: DB 읽기(repo) + 오케스트레이션(service). ES 쓰기 프리미티브는 SearchModule 이 준다.
        HealthcareIndexRepository,
        HealthcareIndexService,
        { provide: KRDATA_CONFIG, useValue: config },
        ...krDataProviders,
        { provide: JUSO_CONFIG, useValue: jusoConfig },
        ...jusoProviders,
        // 국세청 사업자등록 API 는 KRDATA_SERVICE_KEY 를 공유한다 — 별도 설정 없이 KRDATA_CONFIG 를 쓴다.
        ...ntsProviders,
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
        HiraSpecialtySyncService,
        HiraAssessmentSyncService,
        HiraNpaySyncService,
        // 비급여 항목 코드마스터. 요약(List2)에서 분류코드까지 뽑아 채운다.
        HiraNpayCodeSyncService,
        // 심평원 홈페이지 크롤. 서비스키를 안 쓰므로 KRDATA_CONFIG 와 무관하다.
        HiraNpayWebSyncService,
        NmcBabySyncService,
        NmcBasicSyncService,
        HiraDetailSyncService,
        NmcStageService,
        HiraStageService,
        SyncRunnerService,
        HiraNmcMatchService,
        HealthcareCodeSeedService,
        HiraCodeSeedService,
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
        HiraCodeSeedService,
        HealthcareBuildService,
        HealthcareDetailBuildService,
        // ES 색인 오케스트레이션. CLI(es hospital)가 호출한다.
        HealthcareIndexService,
        // CLI 가 큐를 1건씩 돌리는 데 쓴다. 배치 서버가 붙으면 그쪽이 같은 서비스를 쓴다.
        HiraNpayWebSyncService,
        HiraNpayCodeSyncService,
      ],
    };
  }
}
