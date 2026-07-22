export { AdminApplicationModule } from './admin-application.module';

/** 심평원 홈페이지 비급여 크롤 적재. 큐(job_queue)를 꺼내 처리한다 — CLI/배치가 쓴다. */
export { HiraNpayWebSyncService } from './hira/hira-npay-web-sync.service';

/** 비급여 항목 코드마스터 적재. 요약(List2) 전량 페이징으로 코드·이름·분류코드를 채운다. */
export { HiraNpayCodeSyncService } from './hira/hira-npay-code-sync.service';

export { NmcHospitalSyncService } from './nmc/nmc-hospital-sync.service';
export { HiraHospitalSyncService } from './hira/hira-hospital-sync.service';

/** 병원 ES 색인 오케스트레이션(DB→문서→ES). CLI(es hospital)가 쓴다. */
export { HealthcareIndexService } from './healthcare/healthcare-index.service';
export type {
  IndexResult,
  ReindexResult,
} from './healthcare/healthcare-index.service';
export { NmcQueryService } from './nmc/nmc-query.service';
export { NmcHospitalReadService } from './nmc/nmc-hospital-read.service';
export type { NmcHospitalListOptions } from './nmc/nmc-hospital-read.service';
export { HiraQueryService } from './hira/hira-query.service';
export { HiraHospitalReadService } from './hira/hira-hospital-read.service';
export type { HiraHospitalListOptions } from './hira/hira-hospital-read.service';
export type { HiraPageParams } from './hira/hira-query.service';

// 코드 종류(tp) 정의는 application 계층이 소유한다(조회 시 원본 필드명 복원에 쓴다).
// CLI 는 admin 계층만 참조하므로 여기서 다시 내보낸다.
export {
  HIRA_CODE_TYPES,
  HIRA_CODE_TYPE_DEFS,
  isHiraCodeType,
} from '@hansapi/application';
export type { HiraCodeType, HiraCodeResponse } from '@hansapi/application';

export { NmcCodeSyncService } from './nmc/nmc-code-sync.service';
export { HiraCodeSyncService } from './hira/hira-code-sync.service';
export type { HiraCodeSyncOptions } from './hira/hira-code-sync.service';
export { NmcCodeReadService } from './nmc/nmc-code-read.service';
export type { NmcCodeListOptions } from './nmc/nmc-code-read.service';
export { HiraCodeReadService } from './hira/hira-code-read.service';
export { HiraCodeSeedService } from './hira/hira-code-seed.service';
export type { HiraCodeListOptions } from './hira/hira-code-read.service';
export { DEFAULT_CODE_SYNC_ROWS } from './common/code-sync.types';
export type { CodeSyncOptions, CodeSyncResult } from './common/code-sync.types';

export { rebuildNmcRegions, rebuildHiraRegions } from './common/region-rebuild';
export type { RegionRebuildResult } from './common/region-rebuild';

export { SyncRunnerService } from './common/sync-runner.service';
export type {
  RunAllOptions,
  RunAllResult,
  StageRun,
} from './common/sync-runner.service';
export { SyncStateService } from './common/sync-state.service';
export type { SyncJob, SyncOutcome } from './common/sync-state.service';
export { DATA_PROVIDERS } from './common/provider';
export type { DataProvider } from './common/provider';

export {
  NmcStageService,
  NMC_STAGES,
  STAGE_FRESHNESS_HOURS,
  freshnessHours,
} from './nmc/nmc-stage.service';
export type {
  NmcStage,
  StageResult,
  StageRunOptions,
} from './nmc/nmc-stage.service';
export {
  NmcBasicSyncService,
  NMC_MAJOR_DIVS,
} from './nmc/nmc-basic-sync.service';
export {
  HiraDetailSyncService,
  HIRA_DETAIL_OPS,
  HIRA_EXTRA_OPS,
  HIRA_ALL_OPS,
} from './hira/hira-detail-sync.service';
export {
  HiraStageService,
  HIRA_STAGES,
  HIRA_STAGE_CLASSES,
} from './hira/hira-stage.service';
export type { HiraStage } from './hira/hira-stage.service';

export { HealthcareBuildService } from './healthcare/healthcare-build.service';
export { HealthcareDetailBuildService } from './healthcare/healthcare-detail-build.service';
export type { DetailBuildResult } from './healthcare/healthcare-detail-build.service';
export type { BuildResult } from './healthcare/healthcare-build.service';
export { CodeMapper } from './healthcare/code-mapper';

export { HealthcareCodeSeedService } from './healthcare/healthcare-code-seed.service';
export type { CodeSeedResult } from './healthcare/healthcare-code-seed.service';

export { HiraNmcMatchService } from './match/hira-nmc-match.service';
export type { MatchOptions, MatchResult } from './match/hira-nmc-match.service';
export {
  normalizeName,
  normalizeTel,
  nameSimilarity,
  distanceMeters,
} from './match/similarity';

export { describeError } from './common/error';
export { DATA_SOURCES } from './common/data-source';
export type { DataSource } from './common/data-source';
export { DEFAULT_SYNC_ROWS } from './common/sync.types';
export type { SyncOptions, SyncResult } from './common/sync.types';

// 번역은 DB 만 쓴다. 공공데이터 서비스키를 요구하지 않도록 AdminApplicationModule 과 분리했다.
export { I18nModule } from './i18n/i18n.module';
export {
  HospitalI18nExportService,
  I18N_FIELDS,
  isI18nField,
} from './i18n/hospital-i18n-export.service';
export type {
  I18nField,
  I18nExportOptions,
  I18nExportResult,
} from './i18n/hospital-i18n-export.service';
