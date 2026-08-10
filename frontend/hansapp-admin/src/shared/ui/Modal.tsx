import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * 범용 모달. hansapp-web 의 것과 같은 동작이다.
 *
 * document.body 로 포털 렌더링해 부모의 overflow·stacking 영향을 받지 않는다 —
 * 관리 화면은 사이드바가 `fixed` 이고 표가 `overflow-x-auto` 라, 제자리에 그리면
 * 모달이 표 안에 갇히거나 사이드바 뒤로 들어간다.
 *
 * - ESC 로 닫기, 열려 있는 동안 바디 스크롤 잠금
 * - 오버레이 클릭 시 닫기(패널 내부 클릭은 유지)
 */
const WIDTH = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export function Modal({
  title,
  size = 'lg',
  onClose,
  children,
}: {
  title?: ReactNode;
  size?: keyof typeof WIDTH;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`max-h-[90vh] w-full ${WIDTH[size]} animate-fade-in overflow-y-auto rounded-2xl bg-white p-6 shadow-lg sm:p-8`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0 truncate text-lg font-bold text-gray-900">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
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
