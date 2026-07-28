import { DynamicModule, Module } from '@nestjs/common';
import type { ConfigSource } from '@hansapi/common';

import { buildSearchConfig, SEARCH_CONFIG } from './search.config';
import { ElasticsearchService } from './elasticsearch.service';
import { SearchSchemaService } from './schema/search-schema.service';
import { HealthcareHospitalIndexer } from './healthcare-hospital/healthcare-hospital-indexer';

/**
 * 검색(Elasticsearch) 계층 DI 진입점.
 *
 * **순수 ES 계층이다 — DB(Prisma)를 물지 않는다.** ES 클라이언트·스키마 정의·쓰기 프리미티브만
 * 캡슐화한다. 색인할 문서를 DB 에서 읽어 조립하는 오케스트레이션은 admin-application 이 소유하고
 * (그쪽이 이 모듈의 HealthcareHospitalIndexer 를 주입받아 문서를 밀어 넣는다), 조회는 application
 * 계층이 ElasticsearchService 로 직접 한다.
 *
 * 설정은 forRoot 로 받은 ConfigSource 에서 이 계층이 직접 뽑아 검증한다(ES 노드 없으면 부팅 실패).
 */
@Module({})
export class SearchModule {
  static forRoot(source: ConfigSource): DynamicModule {
    return {
      module: SearchModule,
      providers: [
        { provide: SEARCH_CONFIG, useValue: buildSearchConfig(source) },
        ElasticsearchService,
        SearchSchemaService,
        HealthcareHospitalIndexer,
      ],
      exports: [
        SEARCH_CONFIG,
        ElasticsearchService,
        SearchSchemaService,
        HealthcareHospitalIndexer,
      ],
    };
  }
}
