import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

/**
 * 되돌리기 어려운 일을 하기 전에 한 번 묻는 창.
 *
 * **브라우저 기본 confirm() 을 쓰지 않는다.** 그쪽은 무엇이 일어나는지 한 줄밖에 못 적고
 * 화면과도 따로 놀아서, 누르는 사람이 내용을 읽지 않고 확인부터 누르게 된다. 여기서는
 * 무엇이 바뀌는지 본문으로 설명하고, 위험한 행동이면 버튼 색으로도 알린다.
 */
export function ConfirmDialog({
  title,
  confirmLabel = '확인',
  tone = 'default',
  loading = false,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel?: string;
  /** danger 면 확인 버튼이 빨갛다. 지우는 일에 쓴다. */
  tone?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** 무엇이 일어나는지 설명. 한 줄로 끝내지 말 것. */
  children: ReactNode;
}) {
  return (
    <Modal title={title} size="md" onClose={onClose}>
      <div className="space-y-5">
        <div className="text-sm leading-relaxed text-gray-600">{children}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="w-auto px-4" onClick={onClose}>
            취소
          </Button>
          <Button
            className={
              tone === 'danger'
                ? 'w-auto bg-red-600 px-4 hover:bg-red-700'
                : 'w-auto px-4'
            }
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
