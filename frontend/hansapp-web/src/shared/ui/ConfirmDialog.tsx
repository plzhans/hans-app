import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/** 파괴적 동작 확인용 예쁜 다이얼로그(브라우저 confirm 대체). */
export function ConfirmDialog({
  title,
  children,
  confirmText = '확인',
  danger = false,
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md animate-fade-in rounded-2xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          {danger && <AlertTriangle className="h-5 w-5 text-red-500" />}
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        </div>
        <div className="text-sm text-gray-600">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled || loading}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-700'
            }`}
          >
            {loading ? '처리 중…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
