import { SyncResult } from './sync.types';

/** 코드는 한 종류가 수십~수백 건이라 한 번에 다 받는다. */
export const DEFAULT_CODE_SYNC_ROWS = 1_000;

/**
 * 코드 sync 옵션.
 *
 * 병원 sync 와 달리 --full 이 없다. 병원은 8만 건이라 실수로 전량을 긁는 사고를 막아야 하지만,
 * 코드는 전량이 수백 건이고 콜수도 몇 번이라 부분 적재가 오히려 의미가 없다.
 */
export interface CodeSyncOptions {
  /** 한 페이지 결과 수 */
  numOfRows?: number;
}

/** 코드 종류 하나의 sync 결과 */
export interface CodeSyncResult extends SyncResult {
  /** 코드 종류. NMC 는 단일 체계라 'code' 하나뿐이다. */
  tp: string;
}
