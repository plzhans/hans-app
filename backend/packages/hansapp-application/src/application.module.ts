import { DynamicModule, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import type { ConfigSource } from '@hansapp/common';
import { DataModule } from '@hansapp/data';
import { LlmModule } from '@hansapp/llm';
import {
  buildSearchConfig,
  ElasticsearchService,
  SEARCH_CONFIG,
} from '@hansapp/search';

import { EnvSwaggerAllowedIpRepository } from './env/env-swagger-allowed-ip.repository';
import { buildHealthConfig, HEALTH_CONFIG } from './health/health.config';
import { HealthService } from './health/health.service';
import { SwaggerAccessService } from './env/swagger-access.service';
import {
  buildSlackNotifyConfig,
  SLACK_NOTIFY_CONFIG,
} from './notify/slack-notify.config';
import { SlackNotifyService } from './notify/slack-notify.service';
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
import { HealthcareHospitalSearchRepository } from './healthcare/healthcare-hospital-search.repository';
import { HealthcareNonPaymentService } from './healthcare/healthcare-npay.service';
import { HealthcareNonPaymentRepository } from './healthcare/healthcare-npay.repository';
import { JobQueueService } from './common/job-queue.service';
import { JobQueueRepository } from './common/job-queue.repository';
import { HealthcareMetaService } from './healthcare/healthcare-meta.service';
import { HealthcareCodeCache } from './healthcare/healthcare-code.cache';
import { HiraAsmCodeCache } from './healthcare/hira-asm-code.cache';
import { RegionService } from './region/region.service';
import { RegionCache } from './region/region.cache';
import { HealthcareAiSearchService } from './healthcare/healthcare-ai-search.service';
import { DailyQuotaService } from './common/daily-quota.service';

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
  static forRoot(source: ConfigSource): DynamicModule {
    // 병원 상세 등 무거운 조회 결과를 캐싱한다(HealthcareHospitalService 가 CACHE_MANAGER 로 주입받음).
    // REDIS_URL 이 있으면 Redis, 없으면 인메모리로 폴백해 redis 미구성 환경·테스트에서도 부팅을 막지 않는다.
    const redisUrl = source.getUrlOrDefault('redis.url') || undefined;
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
      // LlmModule 은 **통째로 붙인다**(SEARCH_CONFIG 처럼 조각만 뽑지 않는다) —
      // 무거운 연결도 두 번째 커넥션 풀도 없고, 설정이 비면 스스로 조용해지기 때문이다.
      imports: [
        DataModule.forRoot(source),
        LlmModule.forRoot(source),
        cacheModule,
      ],
      providers: [
        // ES 검색(무한 스크롤의 기본 원천). SearchModule 전체가 아니라 조회에 필요한 것만 단다
        // — 색인 서비스·두 번째 Prisma 풀을 서버에 끌어오지 않으려는 것이다. ElasticsearchService 는
        // 지연 연결이라 ELASTICSEARCH_URL 만 있으면 부팅하고, ES 가 죽어 있어도 뜬다(db=true 로 우회).
        { provide: SEARCH_CONFIG, useValue: buildSearchConfig(source) },
        ElasticsearchService,
        HealthcareHospitalSearchRepository,
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
        // Swagger 문서 접근 IP 허용목록(env_swagger_allowed_ip). production 에서 /docs 를
        // 열어두고 등록된 IP 만 통과시키는 데 쓴다 — main.ts 의 미들웨어가 이 서비스를 부른다.
        EnvSwaggerAllowedIpRepository,
        SwaggerAccessService,
        // 서버 기동·종료 슬랙 알림. 설정(SLACK_*)이 비면 스스로 조용해진다 — 부팅은 정상이다.
        // 종료 알림은 Nest 종료 훅으로 스스로 나가므로, 앱은 시작만 알려주면 된다.
        {
          provide: SLACK_NOTIFY_CONFIG,
          useValue: buildSlackNotifyConfig(source),
        },
        SlackNotifyService,
        // 의존 인프라 접속 점검. 판정만 하고 죽일지는 부른 쪽(서버)이 정한다.
        { provide: HEALTH_CONFIG, useValue: buildHealthConfig(source) },
        HealthService,
        // 자연어 질문 → 검색 조건. LLM 호출 자체는 LlmModule 이 맡고(업체 무관),
        // 여기서는 병원 도메인 지식(코드표 검증·범위 판정)만 얹는다.
        HealthcareAiSearchService,
        // 하루 총량 계수기. rate limit 이 못 막는 "총액" 을 묶는다.
        { provide: DailyQuotaService, useValue: new DailyQuotaService(source) },
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
        HealthcareAiSearchService,
        RegionService,
        // 작업 큐. 서버가 넣고 배치(CLI)가 꺼낸다 — MQ 대체품이다.
        JobQueueService,
        // main.ts 가 app.get() 으로 꺼내 Swagger 앞단 미들웨어에 넘긴다.
        // 리포지토리는 내보내지 않는다(규약: 바깥에는 서비스만 보인다).
        SwaggerAccessService,
        // main.ts 가 부팅 마지막에 app.get() 으로 꺼내 시작을 알린다.
        SlackNotifyService,
        // main.ts 가 리슨 전에 app.get() 으로 꺼내 인프라 접속을 확인한다.
        HealthService,
      ],
    };
  }
}
