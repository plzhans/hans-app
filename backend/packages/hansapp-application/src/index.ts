export { ApplicationModule } from './application.module';

export {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './common/pagination.constants';

export type { MirrorListCommand } from './common/mirror.result';

// 원본 API 는 같은 필드를 문자열/숫자로 섞어서 준다. 값을 쓰기 전에 반드시 통과시킨다.
export { asString, asNumber } from './common/coerce';

export { HiraHospitalService } from './hira/hira-hospital.service';
export { NmcHospitalService } from './nmc/nmc-hospital.service';

export { HiraCodeService } from './hira/hira-code.service';
export type { HiraCodeListCommand } from './hira/hira-code.service';
export {
  HIRA_CODE_TYPES,
  HIRA_CODE_TYPE_DEFS,
  isHiraCodeType,
} from './hira/hira-code.types';
export type {
  HiraCodeType,
  HiraCodeItem,
  HiraCodeResponse,
  HiraCodeRow,
} from './hira/hira-code.types';

export { NmcCodeService } from './nmc/nmc-code.service';

export { NmcRegionService } from './nmc/nmc-region.service';
export type { NmcRegionItem } from './nmc/nmc-region.service';
export { HiraRegionService } from './hira/hira-region.service';
export type { HiraRegionItem } from './hira/hira-region.service';
export { NmcSubjectService } from './nmc/nmc-subject.service';
export type { NmcSubjectItem } from './nmc/nmc-subject.service';
export { HiraSubjectService } from './hira/hira-subject.service';
export { NmcBabyService } from './nmc/nmc-baby.service';
export type { NmcCodeListCommand } from './nmc/nmc-code.service';

export { HealthcareHospitalService } from './healthcare/healthcare-hospital.service';
export { HealthcareNonPaymentService } from './healthcare/healthcare-npay.service';
export {
  HealthcareMetaService,
  META_CODE_TYPES,
} from './healthcare/healthcare-meta.service';
export type {
  MetaCode,
  MetaSubject,
  MetaCodeType,
  MetaSubwayStation,
} from './healthcare/healthcare-meta.service';

// 지역(주소)은 도메인 무관이라 healthcare 밑이 아니다. 병원·학교·약국이 같이 쓴다.
export { RegionService } from './region/region.service';
export type { Region } from './region/region.service';
export type {
  HospitalSummary,
  HospitalDetail,
  HospitalSearchCommand,
  HospitalScrollCommand,
  HospitalScrollResult,
  HospitalSubject,
  HospitalHours,
  HospitalStaff,
  HospitalBeds,
  HospitalEquipment,
  HospitalCapability,
  HospitalCode,
  HospitalRegion,
  HospitalLocation,
  HospitalSources,
  HospitalParking,
} from './healthcare/dto/hospital.result';
export type {
  HospitalNonPayment,
  NonPaymentCategory,
  NonPaymentItem,
  NonPaymentPrice,
  NonPaymentPriceDetail,
  NonPaymentSource,
  NonPaymentRequestStatus,
} from './healthcare/dto/npay.result';

/** 크롤 적재(admin)와 조회(application)가 함께 쓰는 저장 모양. */
export type { NpayWebRecord, NpayWebItem } from './healthcare/npay-web.record';

/** 작업 큐. MQ 가 없어서 테이블로 둔 대체품 — 서버가 넣고 배치가 꺼낸다. */
export { JobQueueService, JOB_NPAY_WEB } from './common/job-queue.service';
export type { Job, JobStatus } from './common/job-queue.service';

/**
 * Swagger 문서 접근 IP 허용목록 판정. production 에서 /docs·/openapi.json 앞에 세운다.
 * 미들웨어는 앱(apps-api)에 있고 이 서비스가 판정만 한다.
 */
export { SwaggerAccessService } from './env/swagger-access.service';

/**
 * 서버 기동·종료 슬랙 알림. main.ts 가 부팅 끝에 notifyServerStarted 를 부르고,
 * 종료는 Nest 종료 훅으로 이 서비스가 스스로 알린다(app.enableShutdownHooks() 필요).
 */
export { SlackNotifyService } from './notify/slack-notify.service';
export type { ServerStartedDetail } from './notify/slack-notify.service';
export {
  SLACK_NOTIFY_CONFIG,
  buildSlackNotifyConfig,
} from './notify/slack-notify.config';
export type { SlackNotifyConfig } from './notify/slack-notify.config';
export { matchesAllowedIp, parseIp } from './env/ip-match';
export type { ParsedIp } from './env/ip-match';
