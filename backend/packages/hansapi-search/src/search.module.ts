import { DynamicModule, Module } from '@nestjs/common';
import { EnvSource } from '@hansapi/common';
import { DataModule } from '@hansapi/data';

import { buildSearchConfig, SEARCH_CONFIG } from './search.config';
import { ElasticsearchService } from './elasticsearch.service';
import { SearchSchemaService } from './schema/search-schema.service';
import { HealthcareHospitalIndexRepository } from './healthcare-hospital/healthcare-hospital-index.repository';
import { HealthcareHospitalIndexService } from './healthcare-hospital/healthcare-hospital-index.service';

/**
 * 검색(Elasticsearch) 계층 DI 진입점.
 *
 * ES 클라이언트·스키마 정의·색인 로직을 캡슐화한다. DB 는 DataModule(PrismaService)을 물려 읽고,
 * 설정은 forRoot 로 받은 EnvSource 에서 이 계층이 직접 뽑아 검증한다(ES 노드 없으면 부팅 실패).
 *
 * 지금은 hansapi-cli 가 수동 관리에 쓴다. 추후 API 서버의 검색 조회도 이 모듈이 소유한다.
 */
@Module({})
export class SearchModule {
  static forRoot(source: EnvSource): DynamicModule {
    return {
      module: SearchModule,
      imports: [DataModule.forRoot(source)],
      providers: [
        { provide: SEARCH_CONFIG, useValue: buildSearchConfig(source) },
        ElasticsearchService,
        SearchSchemaService,
        HealthcareHospitalIndexRepository,
        HealthcareHospitalIndexService,
      ],
      exports: [
        ElasticsearchService,
        SearchSchemaService,
        HealthcareHospitalIndexService,
      ],
    };
  }
}
