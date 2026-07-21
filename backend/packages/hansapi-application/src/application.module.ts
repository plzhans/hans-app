import { DynamicModule, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { EnvSource, optionalString } from '@hansapi/common';
import { DataModule } from '@hansapi/data';

import { HiraCodeService } from './hira/hira-code.service';
import { HiraCodeRepository } from './hira/hira-code.repository';
import { HiraRegionService } from './hira/hira-region.service';
import { HiraRegionRepository } from './hira/hira-region.repository';
import { HiraSubjectService } from './hira/hira-subject.service';
import { HiraSubjectRepository } from './hira/hira-subject.repository';
import { HiraHospitalService } from './hira/hira-hospital.service';
import { HiraHospitalRepository } from './hira/hira-hospital.repository';
import { NmcBabyService } from './nmc/nmc-baby.service';
import { NmcBabyRepository } from './nmc/nmc-baby.repository';
import { NmcCodeService } from './nmc/nmc-code.service';
import { NmcCodeRepository } from './nmc/nmc-code.repository';
import { NmcRegionService } from './nmc/nmc-region.service';
import { NmcRegionRepository } from './nmc/nmc-region.repository';
import { NmcSubjectService } from './nmc/nmc-subject.service';
import { NmcSubjectRepository } from './nmc/nmc-subject.repository';
import { NmcHospitalService } from './nmc/nmc-hospital.service';
import { NmcHospitalRepository } from './nmc/nmc-hospital.repository';
import { HealthcareHospitalService } from './healthcare/healthcare-hospital.service';
import { HealthcareHospitalRepository } from './healthcare/healthcare-hospital.repository';
import { HealthcareNonPaymentService } from './healthcare/healthcare-npay.service';
import { HealthcareNonPaymentRepository } from './healthcare/healthcare-npay.repository';
import { JobQueueService } from './common/job-queue.service';
import { JobQueueRepository } from './common/job-queue.repository';
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
    // 병원 상세 등 무거운 조회 결과를 캐싱한다(HealthcareHospitalService 가 CACHE_MANAGER 로 주입받음).
    // REDIS_URL 이 있으면 Redis, 없으면 인메모리로 폴백해 redis 미구성 환경·테스트에서도 부팅을 막지 않는다.
    const redisUrl = optionalString(source, 'REDIS_URL');
    const cacheModule = redisUrl
      ? CacheModule.register({
          isGlobal: true,
          // 하나의 Redis 를 여러 환경이 공유하므로 env 를 namespace 로 걸어 키를 격리한다.
          // 모든 키가 `<env>:` 로 시작해(예: develop:hospital:{1}:base) 환경끼리 안 덮어쓴다.
          // 접두사는 여기서 한 번만 건다 — CachePrefix 는 env 를 몰라도 된다.
          // keyPrefixSeparator 기본값이 `::`(더블 콜론)이라 단일 `:` 로 맞춘다(develop::... 방지).
          stores: [
            createKeyv(redisUrl, {
              namespace: source.env,
              keyPrefixSeparator: ':',
            }),
          ],
        })
      : CacheModule.register({ isGlobal: true });

    return {
      module: ApplicationModule,
      imports: [DataModule.forRoot(source), cacheModule],
      providers: [
        // 저장소(DB 접근). 서비스 내부 의존이라 export 하지 않는다.
        HiraCodeRepository,
        HiraRegionRepository,
        HiraSubjectRepository,
        HiraHospitalRepository,
        NmcCodeRepository,
        NmcRegionRepository,
        NmcSubjectRepository,
        NmcBabyRepository,
        NmcHospitalRepository,
        HealthcareHospitalRepository,
        HealthcareNonPaymentRepository,
        JobQueueRepository,
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
