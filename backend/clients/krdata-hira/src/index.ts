export * from './hira-client';
export { HIRA_BASE_URL } from './mutator';
export type { HiraConfig } from './mutator';
export type * from './generated/hosp-info/model';
export type * from './generated/code-info/model';
export type * from './generated/madm-dtl/model';
export type * from './generated/hosp-diag/model';
export type * from './generated/excl-asm/model';
export type * from './generated/spcl-mdlrt/model';
export type * from './generated/hosp-asm/model';
export type * from './generated/mdfee-crtr/model';
export type * from './generated/msup-cmpn/model';
export type * from './generated/npay-damt/model';
// 공통 헤더·페이지·요양기호 파라미터는 여러 스펙에 동일하게 복제돼 있다.
// star export 만으로는 이름이 모호해지므로 한 모듈 것으로 명시 고정한다.
export type {
  ResultHeader,
  PageInfo,
  PageNoParameter,
  NumOfRowsParameter,
  YkihoParameter,
} from './generated/madm-dtl/model';
// 지역·병원명 파라미터는 hosp-info 와 spcl-mdlrt 에 겹친다. 병원 목록 쪽으로 고정한다.
export type {
  SidoCdParameter,
  SgguCdParameter,
  EmdongNmParameter,
  YadmNmParameter,
  DgsbjtCdParameter,
  ClCdParameter,
} from './generated/hosp-info/model';
