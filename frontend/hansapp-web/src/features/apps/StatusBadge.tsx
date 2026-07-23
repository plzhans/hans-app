import type { AppStatus } from '@/shared/api/apps';

/** 앱 상태 표시(활성/비활성/삭제됨). 색만 다르게, 별도 배지 효과 없음. */
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
  const active = status === 'ACTIVE';
  return (
    <span
      className={`text-sm font-semibold ${
        active ? 'text-green-600' : 'text-gray-400'
      }`}
    >
      {active ? '활성' : '비활성'}
    </span>
  );
}
