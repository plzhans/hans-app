import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Settings } from 'lucide-react';

import { listBoards } from '@/shared/api/boards';
import { BoardModal } from '../BoardModal';
import { deletePost, listPosts, type Post } from '@/shared/api/posts';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Table } from '@/shared/ui/Table';

const COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_110px_90px_110px_140px_90px] gap-4 px-6';

const STATUS_LABEL: Record<Post['status'], string> = {
  DRAFT: '작성 중',
  PUBLISHED: '공개',
  HIDDEN: '숨김',
};

/** 게시판 하나의 글 목록. */
export default function Posts() {
  const boardId = Number(useParams().boardId);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  // 게시판 이름·규칙을 보여주려고 목록에서 이 게시판을 찾는다(게시판은 몇 개뿐이라 통째로 온다).
  const boards = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  const board = boards.data?.find((b) => b.id === boardId);

  const query = useQuery({
    queryKey: ['posts', boardId, page],
    queryFn: () => listPosts(boardId, { page, size: 20 }),
  });
  const rows = query.data?.items ?? [];

  const remove = useMutation({
    mutationFn: (post: Post) => deletePost(post.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', boardId] }),
    onError: (e) => setError(errorMessage(e, '삭제하지 못했습니다.')),
  });

  return (
    <AdminLayout
      title={board ? board.title : '게시글'}
      description={board?.description ?? '이 게시판의 글입니다.'}
      breadcrumbs={[
        { label: '커뮤니티' },
        { label: '게시판', to: '/boards' },
        { label: board?.title ?? String(boardId) },
      ]}
      actions={
        <>
          {/*
            **여기만 `‹ 목록` 규칙에서 뺀다.** 이 화면이 이미 목록이라 같은 이름이 두 뜻을
            가진다 — 글 상세에서 `‹ 목록` 을 눌러 여기 온 사람이 또 `‹ 목록` 을 보면
            같은 곳으로 되돌아가는 줄 안다. 어디로 가는지 이름에 적는다.
          */}
          <Link
            to="/boards"
            className="mr-auto inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white pr-3 pl-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            게시판 목록
          </Link>
          {/*
            **설정을 고치러 게시판 목록까지 되돌아갈 이유가 없다.** 글을 보다가 "댓글을
            켜야겠다" 가 되는 자리는 여기다 — 같은 모달을 그대로 띄운다.
          */}
          <button
            type="button"
            onClick={() => setSettings(true)}
            disabled={!board}
            title="게시판 설정"
            aria-label="게시판 설정"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          >
            <Settings className="h-4 w-4" />
          </button>
          <Link
            to={`/boards/${boardId}/posts/new`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            글쓰기
          </Link>
        </>
      }
    >
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={COLUMNS}
        head={['ID', '제목', '상태', '조회', '공개일', '수정', '']}
      >
        {query.isLoading && <Empty>불러오는 중…</Empty>}
        {!query.isLoading && rows.length === 0 && (
          <Empty>아직 글이 없습니다. 오른쪽 위에서 새 글을 쓰세요.</Empty>
        )}
        {rows.map((post) => {
          const updated = splitDateTime(post.updatedAt);
          return (
            <div
              key={post.id}
              className={cn(
                'grid items-center border-b border-gray-100 py-3 last:border-0',
                COLUMNS,
              )}
            >
              <span className="font-mono text-sm text-gray-400">{post.id}</span>

              <span className="flex min-w-0 items-center gap-2">
                {post.pinned && <Badge tone="blue">고정</Badge>}
                {post.secret && <Badge tone="amber">비공개</Badge>}
                <Link
                  to={`/posts/${post.id}`}
                  className="truncate text-sm font-semibold text-gray-900 hover:text-primary"
                >
                  {post.title}
                </Link>
              </span>

              <span className="text-sm">
                {post.status === 'PUBLISHED' ? (
                  <Badge tone="green">{STATUS_LABEL[post.status]}</Badge>
                ) : (
                  <Badge tone="gray">{STATUS_LABEL[post.status]}</Badge>
                )}
              </span>

              <span className="text-sm text-gray-500">{post.viewCount}</span>

              <span className="text-sm text-gray-500">
                {post.publishedAt?.slice(0, 10) ?? '—'}
              </span>

              <span className="text-sm text-gray-500">
                {updated?.date}
                <span className="block text-xs text-gray-400">
                  {updated?.time}
                </span>
              </span>

              <span className="flex justify-end gap-2 text-sm">
                <Link
                  to={`/posts/${post.id}/edit`}
                  className="text-gray-500 transition hover:text-gray-900"
                >
                  수정
                </Link>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    setError(null);
                    if (confirm(`'${post.title}' 글을 지웁니다. 계속할까요?`)) {
                      remove.mutate(post);
                    }
                  }}
                  className="text-red-500 transition hover:text-red-700"
                >
                  삭제
                </button>
              </span>
            </div>
          );
        })}
      </Table>

      {(query.data?.totalPages ?? 0) > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-gray-500">
            {page} / {query.data?.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= (query.data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}

      {settings && board && (
        <BoardModal board={board} onClose={() => setSettings(false)} />
      )}
    </AdminLayout>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-gray-400">
      {children}
    </div>
  );
}
