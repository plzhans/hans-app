import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listBoards, type Board } from '@/shared/api/boards';
import {
  createPost,
  getPost,
  updatePost,
  type PostStatus,
} from '@/shared/api/posts';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Button } from '@/shared/ui/Button';
import { MarkdownEditor } from '@/shared/ui/MarkdownEditor';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';

const STATUSES: { value: PostStatus; label: string }[] = [
  { value: 'PUBLISHED', label: '공개' },
  { value: 'DRAFT', label: '작성 중' },
  { value: 'HIDDEN', label: '숨김' },
];

/**
 * 글 쓰기·수정.
 *
 * **한 화면이 두 가지를 한다.** 주소에 글 번호가 있으면 수정, 없으면 쓰기다 — 폼이 같은데
 * 화면을 둘로 두면 고칠 때마다 양쪽을 맞춰야 한다.
 *
 * 에디터는 **비제어**다(MarkdownEditor 주석 참고). 그래서 불러온 뒤에 마운트해야 초기값이
 * 들어간다 — 수정 화면에서 글을 다 받기 전에는 에디터를 그리지 않는다.
 */
export default function PostEdit() {
  const params = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const postId = params.id ? Number(params.id) : null;
  const editing = postId !== null;

  const post = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId as number),
    enabled: editing,
  });
  const boards = useQuery({ queryKey: ['boards'], queryFn: listBoards });

  /** 쓰기면 주소의 게시판, 수정이면 글이 속한 게시판. */
  const boardId = editing ? post.data?.boardId : Number(params.boardId);
  const board = boards.data?.find((b: Board) => b.id === boardId);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<PostStatus>('PUBLISHED');
  const [pinned, setPinned] = useState(false);
  const [secret, setSecret] = useState(false);
  const [commentEnabled, setCommentEnabled] = useState<boolean | null>(null);
  const [likeEnabled, setLikeEnabled] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 받아 온 글을 폼에 한 번만 옮긴다. 이 뒤로는 화면이 값을 들고 있다.
  if (editing && post.data && !loaded) {
    setTitle(post.data.title);
    setSummary(post.data.summary ?? '');
    setContent(post.data.content);
    setStatus(post.data.status);
    setPinned(post.data.pinned);
    setSecret(post.data.secret);
    // **?? null 이 필요하다.** 값이 없으면(undefined) 세 칸 중 어느 것과도 같지 않아
    // 아무것도 선택되지 않은 채로 보인다 — 없다는 것은 곧 '게시판 따름' 이다.
    setCommentEnabled(post.data.commentEnabled ?? null);
    setLikeEnabled(post.data.likeEnabled ?? null);
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        content,
        summary: summary.trim(),
        status,
        pinned,
        secret,
        commentEnabled,
        likeEnabled,
      };
      return editing
        ? updatePost(postId, body)
        : createPost(boardId as number, body);
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['posts', saved.boardId] });
      await qc.invalidateQueries({ queryKey: ['post', saved.id] });
      // 고친 글은 바로 확인할 수 있게 보기로, 새 글은 목록으로 보낸다.
      navigate(
        editing ? `/posts/${saved.id}` : `/boards/${saved.boardId}/posts`,
      );
    },
    onError: (e) => setError(errorMessage(e, '저장하지 못했습니다.')),
  });

  const ready = title.trim().length > 0 && content.trim().length > 0;
  // 수정 화면은 글을 다 받아야 에디터를 그린다(비제어라 초기값이 마운트 때 정해진다).
  const editorReady = !editing || loaded;

  return (
    <AdminLayout
      title={editing ? '글 수정' : '글쓰기'}
      description={board ? `${board.title} 게시판` : undefined}
      breadcrumbs={[
        { label: '커뮤니티' },
        { label: '게시판', to: '/boards' },
        ...(boardId
          ? [{ label: board?.title ?? '게시판', to: `/boards/${boardId}/posts` }]
          : []),
        { label: editing ? '수정' : '새 글' },
      ]}
    >
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <TextField
          label="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!editing}
        />

        <TextField
          label="요약"
          hint="목록에 뿌리는 한 줄입니다. 비우면 본문에서 뽑습니다."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">
            본문
          </span>
          {editorReady ? (
            <MarkdownEditor initialValue={content} onChange={setContent} />
          ) : (
            <div className="flex h-[420px] items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-400">
              불러오는 중…
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="상태"
            options={STATUSES}
            value={status}
            onChange={(e) => setStatus(e.target.value as PostStatus)}
          />
          <div className="space-y-2 pt-6">
            <Check checked={pinned} onChange={setPinned} label="목록 맨 위 고정" />
            {/*
              게시판이 끈 기능은 여기서도 켤 수 없다. 서버는 비공개를 조용히 끄지 않고
              거절한다 — 비공개로 쓴 줄 알았는데 공개로 올라가면 그건 사고다.
            */}
            <Check
              checked={secret}
              onChange={setSecret}
              disabled={!board?.secretPostEnabled}
              label="비공개 글"
              hint={
                board?.secretPostEnabled
                  ? undefined
                  : '이 게시판은 비공개 글을 허용하지 않습니다.'
              }
            />
          </div>
        </div>

        {/*
          **글은 자기 뜻만 적는다.** 기본값 '게시판 따름' 으로 두면 나중에 게시판에서 댓글을
          켜고 끌 때 옛 글까지 함께 따라온다 — 글을 하나하나 고칠 수는 없다. 여기서 허용·불가를
          고르는 것은 그 게시판만 예외로 두겠다는 뜻이다.
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Follow
            value={commentEnabled}
            onChange={setCommentEnabled}
            label="댓글"
            boardOn={board?.commentEnabled}
          />
          <Follow
            value={likeEnabled}
            onChange={setLikeEnabled}
            label="좋아요"
            boardOn={board?.likeEnabled}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="w-auto px-4"
            onClick={() =>
              navigate(
                editing
                  ? `/posts/${postId}`
                  : boardId
                    ? `/boards/${boardId}/posts`
                    : '/boards',
              )
            }
          >
            취소
          </Button>
          <Button
            className="w-auto px-4"
            disabled={!ready}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            저장
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}

/**
 * 게시판 따름 / 허용 / 불가.
 *
 * **꺼진 게시판에서도 고를 수 있게 둔다.** 값은 저장될 뿐 지금 열리지는 않는다 — 나중에
 * 게시판을 켤 때를 대비해 이 글만 미리 막아 두는 것이 가능해야 한다. 대신 지금 어떻게
 * 보이는지를 아래 한 줄로 알려 준다.
 */
function Follow({
  value,
  onChange,
  label,
  boardOn,
}: {
  value: boolean | null;
  onChange: (next: boolean | null) => void;
  label: string;
  boardOn?: boolean;
}) {
  const effective = Boolean(boardOn) && (value ?? true);
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(
          [
            [null, '게시판 따름'],
            [true, '허용'],
            [false, '불가'],
          ] as const
        ).map(([option, text]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={(value ?? null) === option}
            className={`h-8 flex-1 rounded-md text-sm font-medium transition ${
              (value ?? null) === option
                ? 'bg-white text-primary shadow-sm ring-1 ring-primary/30'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      <span className="mt-1 block text-xs text-gray-400">
        {boardOn === undefined
          ? ' '
          : effective
            ? `지금 이 글에서 ${label}이(가) 열립니다.`
            : boardOn
              ? `이 글에서만 ${label}을(를) 닫았습니다.`
              : `게시판이 ${label}을(를) 쓰지 않아 닫혀 있습니다.`}
      </span>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm text-gray-700">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}
