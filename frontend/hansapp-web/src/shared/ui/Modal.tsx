import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * 범용 모달. document.body 로 포털 렌더링해 부모의 overflow/stacking 영향을 받지 않는다.
 * - ESC 로 닫기, 열려 있는 동안 바디 스크롤 잠금
 * - 오버레이 클릭 시 닫기(패널 내부 클릭은 유지)
 * - z-40 (파괴적 확인 ConfirmDialog z-50 이 위에 뜨도록)
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg animate-fade-in overflow-y-auto rounded-2xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0 text-lg font-bold text-gray-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 transition hover:text-gray-700"
            title="닫기"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
