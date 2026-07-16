export * from './hira-client';
export { HIRA_BASE_URL } from './mutator';
export type { HiraConfig } from './mutator';
export type * from './generated/hosp-info/model';
export type * from './generated/code-info/model';
export type * from './generated/madm-dtl/model';
// ResultHeader·PageInfo·페이지 파라미터는 세 스펙에 동일하게 복제돼 있다.
// star export 만으로는 이름이 모호해지므로 한 모듈 것으로 명시 고정한다.
export type {
  ResultHeader,
  PageInfo,
  PageNoParameter,
  NumOfRowsParameter,
} from './generated/madm-dtl/model';
