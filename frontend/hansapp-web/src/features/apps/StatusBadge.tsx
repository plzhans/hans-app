import type { AppStatus } from '@/shared/api/apps';

/** 앱/키/클라이언트 상태 표시(심사 중/활성/비활성/삭제됨). 색만 다르게, 별도 배지 효과 없음. */
export function StatusBadge({
  status,
  deleted,
}: {
  status: AppStatus;
  deleted?: boolean;
}) {
  if (deleted) {
    return <span className="text-sm font-semibold text-gray-400">삭제됨</span>;
  }
  const { label, color } =
    status === 'ACTIVE'
      ? { label: '활성', color: 'text-green-600' }
      : status === 'PENDING'
        ? { label: '심사 중', color: 'text-amber-600' }
        : { label: '비활성', color: 'text-gray-400' };
  return <span className={`text-sm font-semibold ${color}`}>{label}</span>;
}
