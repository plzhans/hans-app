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

export { HealthcareHospitalIndexService } from './healthcare-hospital/healthcare-hospital-index.service';
export type { SyncResult } from './healthcare-hospital/healthcare-hospital-index.service';

export type { HealthcareHospitalDoc } from './healthcare-hospital/healthcare-hospital-doc';
