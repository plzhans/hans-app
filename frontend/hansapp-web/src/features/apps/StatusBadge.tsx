import type { AppReviewState, AppStatus } from '@/shared/api/apps';

const LABEL: Record<AppReviewState, { label: string; color: string }> = {
  APPROVED: { label: '활성', color: 'text-green-600' },
  DRAFT: { label: '작성 중', color: 'text-gray-500' },
  REVIEWING: { label: '심사 중', color: 'text-amber-600' },
  REJECTED: { label: '거절됨', color: 'text-red-600' },
  DISABLED: { label: '비활성', color: 'text-gray-400' },
};

/**
 * 앱 상태 표시. reviewState 를 주면 심사 세부 단계(작성 중/심사 중/거절됨)까지 구분하고,
 * 없으면 status(활성/비활성)만 표시한다. 색만 다르게, 별도 배지 효과 없음.
 */
export function StatusBadge({
  status,
  reviewState,
  deleted,
}: {
  status: AppStatus;
  reviewState?: AppReviewState;
  deleted?: boolean;
}) {
  if (deleted) {
    return <span className="text-sm font-semibold text-gray-400">삭제됨</span>;
  }
  const { label, color } = reviewState
    ? LABEL[reviewState]
    : status === 'ACTIVE'
      ? LABEL.APPROVED
      : status === 'PENDING'
        ? LABEL.REVIEWING
        : LABEL.DISABLED;
  return <span className={`text-sm font-semibold ${color}`}>{label}</span>;
}
