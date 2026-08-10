import type { AppStatus, AppSummary } from '@/shared/api/apps';

/**
 * 앱의 표시 상태.
 *
 * **DB 의 status 하나로는 부족하다.** 승인 흐름이 세 값에 흩어져 있다 —
 * `PENDING` 은 "작성 중"·"심사 중"·"거절됨" 셋을 겸하고, 그 구분은 `reviewRequestedAt`
 * 과 `rejectionReason` 이 정한다. 소프트 삭제(`deletedAt`)는 또 다른 축이다.
 * 화면이 그 규칙을 매번 다시 쓰지 않게 여기서 한 번만 푼다.
 */
export type AppDisplayStatus =
  | 'DELETED'
  | 'ACTIVE'
  | 'DISABLED'
  | 'REJECTED'
  | 'REVIEWING'
  | 'DRAFT';

export function displayStatus(app: AppSummary): AppDisplayStatus {
  // 삭제가 가장 우선이다 — 지워진 앱의 상태값은 볼 의미가 없다.
  if (app.deletedAt) return 'DELETED';
  if (app.status === 'ACTIVE') return 'ACTIVE';
  if (app.status === 'DISABLED') return 'DISABLED';
  // 여기서부터 PENDING.
  if (app.rejectionReason) return 'REJECTED';
  return app.reviewRequestedAt ? 'REVIEWING' : 'DRAFT';
}

export const DISPLAY_LABEL: Record<AppDisplayStatus, string> = {
  DELETED: '삭제됨',
  ACTIVE: '승인',
  DISABLED: '중지',
  REJECTED: '거절',
  REVIEWING: '심사 중',
  DRAFT: '작성 중',
};

export const DISPLAY_TONE: Record<
  AppDisplayStatus,
  'green' | 'gray' | 'amber' | 'red' | 'blue'
> = {
  DELETED: 'gray',
  ACTIVE: 'green',
  DISABLED: 'gray',
  REJECTED: 'red',
  REVIEWING: 'amber',
  DRAFT: 'blue',
};

/** 목록 필터에 쓰는 status 값(DB 기준). 표시 상태와 축이 달라 따로 둔다. */
export const STATUS_FILTERS: { value: AppStatus | ''; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'ACTIVE', label: '승인' },
  { value: 'PENDING', label: '미승인' },
  { value: 'DISABLED', label: '중지' },
];
