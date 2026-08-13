import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createBoard,
  updateBoard,
  type Board,
  type BoardStatus,
  type BoardWriteRole,
} from '@/shared/api/boards';
import { errorMessage } from '@/shared/api/errorMessage';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';

const WRITE_ROLES: { value: BoardWriteRole; label: string }[] = [
  { value: 'ADMIN', label: '관리자만' },
  { value: 'MEMBER', label: '로그인한 회원' },
];

const STATUSES: { value: BoardStatus; label: string }[] = [
  { value: 'ACTIVE', label: '공개' },
  { value: 'HIDDEN', label: '숨김' },
];

/**
 * 게시판 추가·수정.
 *
 * **이 화면이 정하는 것은 게시판의 규칙이다.** 누가 쓰나·댓글을 받나·비공개를 허용하나.
 * 글과 댓글에도 같은 이름의 설정이 있지만 여기서 켠 범위 안에서만 의미가 있어서,
 * 상위를 끄면 하위 항목도 화면에서 함께 잠긴다(서버도 같은 규칙으로 정리한다).
 */
export function BoardModal({
  board,
  onClose,
}: {
  /** 없으면 추가, 있으면 수정. */
  board?: Board;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = board !== undefined;

  const [name, setName] = useState(board?.name ?? '');
  const [title, setTitle] = useState(board?.title ?? '');
  const [description, setDescription] = useState(board?.description ?? '');
  const [writeRole, setWriteRole] = useState<BoardWriteRole>(
    board?.writeRole ?? 'ADMIN',
  );
  const [commentEnabled, setCommentEnabled] = useState(
    board?.commentEnabled ?? false,
  );
  const [likeEnabled, setLikeEnabled] = useState(board?.likeEnabled ?? false);
  const [secretPostEnabled, setSecretPostEnabled] = useState(
    board?.secretPostEnabled ?? false,
  );
  const [secretCommentEnabled, setSecretCommentEnabled] = useState(
    board?.secretCommentEnabled ?? false,
  );
  const [status, setStatus] = useState<BoardStatus>(board?.status ?? 'ACTIVE');
  const [sortOrder, setSortOrder] = useState(String(board?.sortOrder ?? 0));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim().toLowerCase(),
        title: title.trim(),
        description: description.trim(),
        writeRole,
        commentEnabled,
        likeEnabled,
        secretPostEnabled,
        // 댓글이 꺼져 있으면 비공개 댓글도 없다. 서버도 같은 정리를 하지만
        // 화면이 보낸 값과 저장된 값이 달라지지 않게 여기서도 맞춰 보낸다.
        secretCommentEnabled: commentEnabled && secretCommentEnabled,
        status,
        sortOrder: Number(sortOrder) || 0,
      };
      return editing ? updateBoard(board.id, body) : createBoard(body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['boards'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e, '저장하지 못했습니다.')),
  });

  const ready = name.trim().length >= 2 && title.trim().length > 0;

  return (
    <Modal title={editing ? '게시판 설정' : '게시판 추가'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="이름"
            hint="주소에 쓰는 값입니다. 소문자·숫자·하이픈."
            placeholder="notice"
            value={name}
            /*
              **거르는 것은 CSS 가 아니라 여기다.** ime-mode(.input-latin)는 한글 자판이
              먼저 뜨는 것을 막을 뿐이고 그마저 Firefox 정도만 듣는다 — 붙여넣기까지 막으려면
              값을 직접 걸러야 한다. 서버도 같은 규칙으로 한 번 더 본다.
            */
            onChange={(e) =>
              setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
            }
            className="input-latin"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!editing}
          />
          <TextField
            label="제목"
            hint="화면에 보이는 이름입니다."
            placeholder="공지사항"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <TextField
          label="설명"
          hint="목록 위에 한 줄로 붙습니다. 비워도 됩니다."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="글쓰기"
            options={WRITE_ROLES}
            value={writeRole}
            onChange={(e) => setWriteRole(e.target.value as BoardWriteRole)}
          />
          <SelectField
            label="공개"
            options={STATUSES}
            value={status}
            onChange={(e) => setStatus(e.target.value as BoardStatus)}
          />
          <TextField
            label="순서"
            hint="작은 값이 앞."
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>

        <fieldset className="rounded-xl border border-gray-200 p-4">
          <legend className="px-1 text-sm font-semibold text-gray-700">
            기능
          </legend>
          <div className="space-y-3">
            <Switch
              checked={commentEnabled}
              onChange={setCommentEnabled}
              label="댓글 사용"
              hint="끄면 이 게시판의 모든 글에 댓글이 없습니다."
            />
            <Switch
              checked={likeEnabled}
              onChange={setLikeEnabled}
              label="좋아요 사용"
              hint="끄면 이 게시판의 모든 글에서 좋아요가 사라집니다."
            />
            <Switch
              checked={secretPostEnabled}
              onChange={setSecretPostEnabled}
              label="비공개 글 허용"
              hint="본문을 쓴 사람과 운영자만 봅니다. 목록에는 제목만 남습니다."
            />
            <Switch
              checked={commentEnabled && secretCommentEnabled}
              onChange={setSecretCommentEnabled}
              // 댓글이 없는 게시판에 이 값만 켜져 있으면 화면이 거짓말을 한다.
              disabled={!commentEnabled}
              label="비공개 댓글 허용"
              hint={
                commentEnabled
                  ? '본문을 쓴 사람과 글쓴이, 운영자만 봅니다.'
                  : '댓글을 사용해야 켤 수 있습니다.'
              }
            />
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="w-auto px-4" onClick={onClose}>
            취소
          </Button>
          <Button
            className="w-auto px-4"
            disabled={!ready}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {editing ? '저장' : '추가'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 켜고 끄는 한 줄. 설명이 붙는 체크박스라 따로 뺐다. */
function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <span className="block text-xs text-gray-400">{hint}</span>
      </span>
    </label>
  );
}
