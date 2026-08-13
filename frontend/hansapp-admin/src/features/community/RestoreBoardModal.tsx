import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { restoreBoard, type DeletedBoard } from '@/shared/api/boards';
import { errorMessage } from '@/shared/api/errorMessage';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { TextField } from '@/shared/ui/TextField';

/**
 * 복구창.
 *
 * **이름을 다시 받는다.** 지울 때 이름을 비켜 두므로(`notice` → `notice_12_deleted`) 그대로
 * 되돌릴 수 없고, 지운 사이에 누가 같은 이름으로 새 게시판을 만들었을 수도 있다. 그래서
 * 원래 이름을 채워 두되 고칠 수 있게 하고, 겹치면 서버가 거절한다 — 누르는 순간 그 이름이
 * 비어 있는지는 서버만 안다.
 */
export function RestoreBoardModal({
  board,
  onClose,
  onRestored,
}: {
  board: DeletedBoard;
  onClose: () => void;
  /** 되살아난 뒤. 부르는 쪽이 어디를 보여 줄지 정한다. */
  onRestored?: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(board.suggestedName);
  const [error, setError] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: () => restoreBoard(board.id, name.trim()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['boards'] });
      onRestored?.();
      onClose();
    },
    onError: (e) => setError(errorMessage(e, '되살리지 못했습니다.')),
  });

  const deleted = splitDateTime(board.deletedAt);

  return (
    <Modal title="게시판 복구" size="md" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-600">
          <b>{board.title}</b> 게시판을 되살립니다. 안에 있던 글{' '}
          <b>{board.postCount}개</b>도 함께 돌아옵니다.
          {deleted && (
            <span className="mt-1 block text-xs text-gray-400">
              {deleted.date} {deleted.time} 에 지웠습니다.
            </span>
          )}
        </p>

        <TextField
          label="이름"
          hint="주소에 쓰는 값입니다. 이미 쓰는 이름이면 되살릴 수 없습니다."
          value={name}
          onChange={(e) => {
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            setError(null);
          }}
          className="input-latin font-mono"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="w-auto px-4" onClick={onClose}>
            취소
          </Button>
          <Button
            className="w-auto px-4"
            disabled={name.trim().length < 2}
            loading={restore.isPending}
            onClick={() => restore.mutate()}
          >
            복구
          </Button>
        </div>
      </div>
    </Modal>
  );
}
