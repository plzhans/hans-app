import { DynamicModule, Module } from '@nestjs/common';
import { EnvSource } from '@hansapi/common';
import { DataModule } from '@hansapi/data';

import { HiraCodeService } from './hira/hira-code.service';
import { HiraRegionService } from './hira/hira-region.service';
import { HiraSubjectService } from './hira/hira-subject.service';
import { HiraHospitalService } from './hira/hira-hospital.service';
import { NmcBabyService } from './nmc/nmc-baby.service';
import { NmcCodeService } from './nmc/nmc-code.service';
import { NmcRegionService } from './nmc/nmc-region.service';
import { NmcSubjectService } from './nmc/nmc-subject.service';
import { NmcHospitalService } from './nmc/nmc-hospital.service';
import { HealthcareHospitalService } from './healthcare/healthcare-hospital.service';
import { HealthcareNonPaymentService } from './healthcare/healthcare-npay.service';
import { JobQueueService } from './common/job-queue.service';
import { HealthcareMetaService } from './healthcare/healthcare-meta.service';
import { HealthcareCodeCache } from './healthcare/healthcare-code.cache';
import { HiraAsmCodeCache } from './healthcare/hira-asm-code.cache';
import { RegionService } from './region/region.service';
import { RegionCache } from './region/region.cache';

/**
 * 응용 계층의 DI 진입점. 제공하는 서비스를 여기서 export 하고,
 * server 앱은 `imports: [ApplicationModule.forRoot(src)]` 로 주입받는다.
 *
 * DB 접근은 DataModule 에 위임하며, 스키마·커넥션 세부는 신경 쓰지 않는다.
 * 이 계층은 로컬 DB 만 읽는다. 공공데이터 API 설정(서비스키 등)은 알지 못하며,
 * 그래서 서버는 서비스키가 없어도 뜬다. 외부 API 호출은 admin-application 의 몫이다.
 */
@Module({})
export class ApplicationModule {
  static forRoot(source: EnvSource): DynamicModule {
    return {
      module: ApplicationModule,
      imports: [DataModule.forRoot(source)],
      providers: [
        HiraHospitalService,
        NmcHospitalService,
        HiraCodeService,
        NmcCodeService,
        HiraRegionService,
        NmcRegionService,
        HiraSubjectService,
        NmcSubjectService,
        NmcBabyService,
        // 코드표 인메모리 캐시. 부팅 시 전량 로드해 아래 서비스들이 조인 대신 참조한다.
        HealthcareCodeCache,
        HiraAsmCodeCache,
        RegionCache,
        HealthcareHospitalService,
        HealthcareNonPaymentService,
        HealthcareMetaService,
        RegionService,
        // 작업 큐. 서버가 넣고 배치(CLI)가 꺼낸다 — MQ 대체품이다.
        JobQueueService,
      ],
      exports: [
        HiraHospitalService,
        NmcHospitalService,
        HiraCodeService,
        NmcCodeService,
        HiraRegionService,
        NmcRegionService,
        HiraSubjectService,
        NmcSubjectService,
        NmcBabyService,
        HealthcareCodeCache,
        HiraAsmCodeCache,
        RegionCache,
        HealthcareHospitalService,
        HealthcareNonPaymentService,
        HealthcareMetaService,
        RegionService,
        // 작업 큐. 서버가 넣고 배치(CLI)가 꺼낸다 — MQ 대체품이다.
        JobQueueService,
      ],
    };
  }
}
