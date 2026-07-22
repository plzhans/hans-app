export { SearchModule } from './search.module';

export { SEARCH_CONFIG, buildSearchConfig } from './search.config';
export type { SearchConfig } from './search.config';

export { ElasticsearchService } from './elasticsearch.service';

export {
  INDEX_DEFINITIONS,
  DEFAULT_SCHEMA_DIR,
  HEALTHCARE_HOSPITAL_ALIAS,
} from './schema/index';
export type { IndexDefinition } from './schema/index';
export { SearchSchemaService } from './schema/search-schema.service';
export type {
  SchemaImportResult,
  SchemaStatus,
  IndexImportRow,
  IndexStatusRow,
} from './schema/search-schema.service';

// ES 쓰기 프리미티브(DB 무관). 원천 읽기·문서 조립·배치 오케스트레이션은 admin 계층이 소유한다.
export {
  HealthcareHospitalIndexer,
  type BulkIndexResult,
} from './healthcare-hospital/healthcare-hospital-indexer';

// ES 문서의 "모양"(출력 계약)만 노출한다. DB→문서 변환기(buildHealthcareHospitalDoc)와 그 입력 행
// 타입은 DB 를 아는 admin 계층이 소유한다 — admin 이 이 타입을 채워 인덱서에 넘긴다.
export { SUPPORTED_LANGS } from './healthcare-hospital/healthcare-hospital-doc';
export type {
  HealthcareHospitalDoc,
  Lang,
  LangMap,
  LangListMap,
} from './healthcare-hospital/healthcare-hospital-doc';
