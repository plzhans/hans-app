/**
 * 시드 데이터.
 *
 * 코드 매핑처럼 **사람이 만들고 자주 안 바뀌는 데이터**를 여기 둔다.
 * DB 에 직접 INSERT 하지 않는 이유: 재현이 안 되고, 환경마다 손으로 넣어야 하고,
 * 누가 언제 바꿨는지 안 남는다. 파일로 두면 git 이 그 셋을 다 해결한다.
 */
export { HEALTHCARE_CODES, IGNORED_SOURCE_CODES } from './healthcare-code.seed';
export type { HealthcareCodeSeed } from './healthcare-code.seed';

export { HIRA_CODES, ASM_ITEM_SCOPE } from './hira-code.seed';
export type { HiraCodeSeed, AsmScope } from './hira-code.seed';

export { REGION_CODES } from './region-code.seed';
export type { RegionCodeSeed } from './region-code.seed';
export {
  SUBJECT_GROUPS,
  HOSPITAL_TIERS,
  TIER_NAMES,
  INPATIENT_ONLY_CLASSES,
  INPATIENT_TIERS,
  isSubjectAllowed,
  hospitalTier,
  type HospitalTier,
  subjectField,
  isSpecialtySubject,
  NON_SPECIALTY_SUBJECTS,
  type MedicalField,
  type SubjectGroupSeed,
  type HospitalTierSeed,
} from './hospital-taxonomy.seed';
