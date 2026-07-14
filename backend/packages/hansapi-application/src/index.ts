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
export {
  HealthcareMetaService,
  META_CODE_TYPES,
} from './healthcare/healthcare-meta.service';
export type {
  MetaCode,
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
