import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import {
  deleteBoard,
  listBoards,
  type Board,
} from '@/shared/api/boards';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Table } from '@/shared/ui/Table';
import { BoardModal } from '../BoardModal';

/** 표 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_140px_110px_minmax(0,220px)_80px_90px_140px] gap-4 px-6';

/**
 * 게시판 목록.
 *
 * **페이징이 없다.** 게시판은 몇 개뿐이고, 이 화면을 여는 이유가 "지금 어떤 게시판이
 * 있고 각각 어떤 규칙인가" 라서 한 화면에 다 보이는 편이 낫다.
 */
export default function Boards() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Board | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  const rows = query.data ?? [];

  const remove = useMutation({
    mutationFn: (board: Board) => deleteBoard(board.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards'] }),
    onError: (e) => setError(errorMessage(e, '삭제하지 못했습니다.')),
  });

  return (
    <AdminLayout
      title="게시판"
      description="게시판마다 누가 쓰는지·댓글을 받는지를 따로 정합니다."
      breadcrumbs={[{ label: '커뮤니티' }, { label: '게시판' }]}
      actions={
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          게시판 추가
        </button>
      }
    >
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Table
        columns={COLUMNS}
        head={['ID', '제목', '이름', '글쓰기', '기능', '글', '공개', '']}
      >
        {query.isLoading && <Empty>불러오는 중…</Empty>}
        {!query.isLoading && rows.length === 0 && (
          <Empty>아직 게시판이 없습니다. 오른쪽 위에서 추가하세요.</Empty>
        )}
        {rows.map((board) => (
          <div
            key={board.id}
            className={cn(
              'grid items-center border-b border-gray-100 py-3 last:border-0',
              COLUMNS,
            )}
          >
            <span className="font-mono text-sm text-gray-400">{board.id}</span>

            <span className="min-w-0">
              {/* 제목을 누르면 그 게시판의 글 목록으로 간다. */}
              <Link
                to={`/boards/${board.id}/posts`}
                className="block truncate text-sm font-semibold text-gray-900 hover:text-primary"
              >
                {board.title}
              </Link>
              {board.description && (
                <span className="block truncate text-xs text-gray-400">
                  {board.description}
                </span>
              )}
            </span>

            <span className="truncate font-mono text-xs text-gray-500">
              {board.name}
            </span>

            <span className="text-sm text-gray-600">
              {board.writeRole === 'ADMIN' ? '관리자만' : '회원'}
            </span>

            {/* 켜진 것만 보여준다 — 꺼진 것까지 늘어놓으면 어느 게시판이 다른지 안 보인다. */}
            <span className="flex flex-wrap gap-1">
              {board.commentEnabled && <Badge tone="blue">댓글</Badge>}
              {board.secretPostEnabled && <Badge tone="amber">비공개 글</Badge>}
              {board.secretCommentEnabled && (
                <Badge tone="amber">비공개 댓글</Badge>
              )}
              {!board.commentEnabled &&
                !board.secretPostEnabled &&
                !board.secretCommentEnabled && (
                  <span className="text-xs text-gray-300">—</span>
                )}
            </span>

            <span className="text-sm text-gray-500">{board.postCount}</span>

            <span>
              {board.status === 'ACTIVE' ? (
                <Badge tone="green">공개</Badge>
              ) : (
                <Badge tone="gray">숨김</Badge>
              )}
            </span>

            <span className="flex justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={() => setEditing(board)}
                className="text-gray-500 transition hover:text-gray-900"
              >
                수정
              </button>
              {/*
                **글이 있으면 지울 수 없다.** 서버가 거절하지만 여기서도 눌리지 않게 둔다 —
                누를 수 있는 버튼이 매번 실패하면 그 화면을 믿지 않게 된다.
              */}
              <button
                type="button"
                disabled={board.postCount > 0 || remove.isPending}
                title={
                  board.postCount > 0
                    ? '글이 있는 게시판은 지울 수 없습니다. 숨김으로 내리세요.'
                    : undefined
                }
                onClick={() => {
                  setError(null);
                  if (confirm(`'${board.title}' 게시판을 지웁니다. 계속할까요?`)) {
                    remove.mutate(board);
                  }
                }}
                className="text-red-500 transition hover:text-red-700 disabled:cursor-not-allowed disabled:text-gray-300"
              >
                삭제
              </button>
            </span>
          </div>
        ))}
      </Table>

      {creating && <BoardModal onClose={() => setCreating(false)} />}
      {editing && (
        <BoardModal board={editing} onClose={() => setEditing(null)} />
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
