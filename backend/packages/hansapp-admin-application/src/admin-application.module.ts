import { DynamicModule, Module } from '@nestjs/common';
import {
  buildSettingKeyring,
  SETTING_KEYRING,
  type ConfigSource,
  type SecretBoxKeys,
} from '@hansapp/common';
import { ApplicationModule } from '@hansapp/application';
import { DataModule, SettingReadRepository } from '@hansapp/data';
import { SearchModule } from '@hansapp/search';

import { SettingCache } from './setting/setting-cache.service';
import { SettingAdminService } from './setting/setting-admin.service';
import { SettingWriteRepository } from './setting/setting-write.repository';
import { EnvLlmKeyWriteRepository } from './llm/env-llm-key-write.repository';
import { EnvLlmKeyAdminService } from './llm/env-llm-key-admin.service';
import { EnvLlmModelWriteRepository } from './llm/env-llm-model-write.repository';
import { EnvLlmModelAdminService } from './llm/env-llm-model-admin.service';
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
import { AppReadRepository } from './app-registry/app-read.repository';
import { AppReadService } from './app-registry/app-read.service';
import { UserReadRepository } from './user/user-read.repository';
import { UserReadService } from './user/user-read.service';
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
import { HealthcareNameBuildRepository } from './healthcare/healthcare-name-build.repository';
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
import {
  buildKrDataConfig,
  DEFAULT_HIRA_DETAIL_VERSION,
  KRDATA_CONFIG,
  type KrDataAppConfig,
} from './krdata.config';
import { krDataProviders } from './krdata.providers';
import {
  buildJusoConfig,
  JUSO_CONFIG,
  type JusoAppConfig,
} from './juso.config';
import { jusoProviders } from './juso.providers';
import { ntsProviders } from './nts.providers';
import { NmcCodeReadService } from './nmc/nmc-code-read.service';
import { NmcBabySyncService } from './nmc/nmc-baby-sync.service';
import { NmcBasicSyncService } from './nmc/nmc-basic-sync.service';
import { NmcStageService } from './nmc/nmc-stage.service';
import { MoisStageService } from './mois/mois-stage.service';
import { MoisQueryService } from './mois/mois-query.service';
import { MoisRegionSyncService } from './mois/mois-region-sync.service';
import { MoisRegionSyncRepository } from './mois/mois-region-sync.repository';
import { NmcSubjectSyncService } from './nmc/nmc-subject-sync.service';
import { HealthcareBuildService } from './healthcare/healthcare-build.service';
import { HealthcareNameBuildService } from './healthcare/healthcare-name-build.service';
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
 * hansapp-api(게이트웨이)는 이 모듈을 참조하지 않는다. 서버는 로컬 DB 만 읽고,
 * 외부 공공데이터 API 를 직접 호출하는 것은 이 계층뿐이다. 콜수 제한이 걸린 API 를
 * 서버가 실수로 때리는 사고를 의존성 그래프로 막는다.
 *
 * 지금은 hansapp-cli 가 사용하며, 추후 hansapp-admin-server 가 같은 모듈을 import 한다.
 */
@Module({})
export class AdminApplicationModule {
  static forRoot(source: ConfigSource): DynamicModule {
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
        /*
          서비스 설정(env_setting). 값은 DB 에, **어떤 설정이 있는지는 코드(카탈로그)** 에 있고
          그 카탈로그는 @hansapp/common 이 갖는다. 읽기 저장소는 @hansapp/data 것을 그대로 쓰고,
          **쓰기는 이 계층에만 둔다** — 관리자 아닌 계층에서 설정을 덮을 자리를 만들지 않는다.

          **설정 파일 폴백은 없다.** 카탈로그의 모든 값이 DB 로 넘어가서, 두 곳을 보면
          `.env` 의 주석 한 줄이 풀리는 것만으로 화면이 파일 값을 다시 집는다.
        */
        { provide: SETTING_KEYRING, useValue: buildSettingKeyring(source) },
        SettingWriteRepository,
        {
          provide: SettingCache,
          useFactory: (
            repo: SettingReadRepository,
            keyring: SecretBoxKeys | undefined,
          ) => new SettingCache(repo, keyring),
          inject: [SettingReadRepository, SETTING_KEYRING],
        },
        SettingAdminService,
        // 서버 LLM 키(env_llm_key). 설정이 아니라 관리 대상 목록이라 CRUD 가 붙는다.
        EnvLlmKeyWriteRepository,
        EnvLlmKeyAdminService,
        EnvLlmModelWriteRepository,
        EnvLlmModelAdminService,
        // 저장소(DB 접근). 서비스 내부 의존이라 export 하지 않는다.
        HiraHospitalSyncRepository,
        NmcBasicSyncRepository,
        NmcBabySyncRepository,
        NmcCodeSyncRepository,
        NmcHospitalSyncRepository,
        NmcSubjectSyncRepository,
        SyncStateRepository,
        UserReadRepository,
        AppReadRepository,
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
        HealthcareNameBuildRepository,
        HealthcareDetailBuildRepository,
        // ES 색인: DB 읽기(repo) + 오케스트레이션(service). ES 쓰기 프리미티브는 SearchModule 이 준다.
        HealthcareIndexRepository,
        HealthcareIndexService,
        /*
          서비스키는 DB(env_setting)에서 읽는다. **부팅할 때 한 번만 읽는다** —
          배치·CLI 는 명령 하나 돌고 끝나는 프로세스라 "재시작 없이 반영" 이 뜻이 없고,
          동기화 도중에 키가 바뀌는 것이 오히려 이상하다.
          (요청마다 도는 API 서버 쪽은 팩토리로 매번 만든다 — NtsClientFactory 참고.)
        */
        {
          provide: KRDATA_CONFIG,
          useFactory: async (
            settings: SettingCache,
          ): Promise<KrDataAppConfig> => ({
            ...config,
            serviceKey: (await settings.getString('krdata.serviceKey')) ?? '',
            hiraDetailVersion:
              (await settings.getString('krdata.hiraDetailVersion')) ||
              DEFAULT_HIRA_DETAIL_VERSION,
          }),
          inject: [SettingCache],
        },
        ...krDataProviders,
        {
          provide: JUSO_CONFIG,
          useFactory: async (
            settings: SettingCache,
          ): Promise<JusoAppConfig> => ({
            ...jusoConfig,
            confmKey: (await settings.getString('juso.serviceKey')) ?? '',
          }),
          inject: [SettingCache],
        },
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
        UserReadService,
        AppReadService,
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
        // 행정안전부 법정동코드. 지역 정본이라 배치에서 가장 먼저 돈다.
        MoisQueryService,
        MoisRegionSyncRepository,
        MoisRegionSyncService,
        MoisStageService,
        NmcStageService,
        HiraStageService,
        SyncRunnerService,
        HiraNmcMatchService,
        HealthcareCodeSeedService,
        HiraCodeSeedService,
        HealthcareBuildService,
        HealthcareNameBuildService,
        HealthcareDetailBuildService,
      ],
      // SDK 클라이언트는 export 하지 않는다. 외부 API 호출은 이 계층 안에 가둔다.
      exports: [
        SettingCache,
        SettingAdminService,
        EnvLlmKeyAdminService,
        // 서버 LLM 키(env_llm_key). 설정이 아니라 관리 대상 목록이라 CRUD 가 붙는다.
        EnvLlmKeyWriteRepository,
        EnvLlmKeyAdminService,
        EnvLlmModelWriteRepository,
        EnvLlmModelAdminService,
        /*
          **모듈을 통째로 다시 내보낸다.** Nest 는 provider 를 전이적으로 노출하지 않아서,
          이걸 안 하면 이 모듈을 import 한 앱의 컨트롤러가 ApplicationModule 의 서비스
          (SettingCache·SettingAdminService 등)를 생성자로 못 받는다.
          app.get() 은 모듈을 안 가려서 되지만 컨트롤러 주입은 안 된다 — 그래서 걸린다.
        */
        ApplicationModule,
        UserReadService,
        AppReadService,
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
        MoisQueryService,
        MoisRegionSyncService,
        MoisStageService,
        NmcStageService,
        HiraStageService,
        SyncRunnerService,
        HiraNmcMatchService,
        HealthcareCodeSeedService,
        HiraCodeSeedService,
        HealthcareBuildService,
        HealthcareNameBuildService,
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
