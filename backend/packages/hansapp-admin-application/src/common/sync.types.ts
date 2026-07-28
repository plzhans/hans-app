/** 기본 페이지 크기. 실측상 10,000건이 응답시간(약 3초)과 메모리(약 11MB)의 균형점이다. */
export const DEFAULT_SYNC_ROWS = 10_000;

/**
 * sync 실행 옵션.
 *
 * 아무 옵션도 주지 않으면 **1건만** 적재한다. 실수로 8만 건을 긁는 사고를 막기 위한 기본값이다.
 * 전체를 적재하려면 반드시 full 을 켜야 한다.
 */
export interface SyncOptions {
  /** 전체 적재. 켜지 않으면 한 페이지만 적재한다. */
  full?: boolean;

  /** 적재할 페이지 번호. full 일 때는 무시된다. */
  pageNo?: number;

  /** 한 페이지 결과 수. 지정하지 않으면 full 이면 10,000, 아니면 1. */
  numOfRows?: number;
}

/** sync 실행 결과 */
export interface SyncResult {
  /** API 가 보고한 전체 건수 */
  totalCount: number;

  /** 실제로 가져온 건수 */
  fetched: number;

  /** DB 에 upsert 한 건수 */
  upserted: number;

  /** 호출한 API 페이지 수 */
  pages: number;

  /** 재생성된 지역(시도×시군구) 수. 코드 sync 에는 없다. */
  regions?: number;

  /** 소요 시간 (ms) */
  elapsedMs: number;
}

/** 옵션을 실제 페이지 번호·크기로 푼다. */
export function resolveSyncOptions(options: SyncOptions): {
  full: boolean;
  pageNo: number;
  numOfRows: number;
} {
  const full = options.full === true;
  return {
    full,
    pageNo: options.pageNo ?? 1,
    // 옵션을 안 주면 1건. full 이면 10,000건.
    numOfRows: options.numOfRows ?? (full ? DEFAULT_SYNC_ROWS : 1),
  };
}
