import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Settings, Trash2 } from 'lucide-react';

import {
  deleteBoard,
  listBoards,
  listDeletedBoards,
  type Board,
  type DeletedBoard,
} from '@/shared/api/boards';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Table } from '@/shared/ui/Table';
import { BoardModal } from '../BoardModal';
import { RestoreBoardModal } from '../RestoreBoardModal';

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
  const [removing, setRemoving] = useState<Board | null>(null);
  const [restoring, setRestoring] = useState<DeletedBoard | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    **탭을 주소에 적는다.** 화면 안에만 두면 새로고침하거나 뒤로 갔다 오면 원래 탭으로
    돌아간다 — 지운 게시판을 보다 되살리면 목록이 다시 불리는데, 그때 튕겨 나가면
    방금 무엇을 했는지 놓친다. 주소에 있으면 링크로 건네줄 수도 있다.
  */
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'deleted' ? 'deleted' : 'active';
  const setTab = (next: 'active' | 'deleted') => {
    const nextParams = new URLSearchParams(params);
    // 기본 탭은 주소에 적지 않는다. ?tab=active 는 아무것도 더 알려주지 않는다.
    if (next === 'active') nextParams.delete('tab');
    else nextParams.set('tab', next);
    // 탭 이동은 방문 기록을 남기지 않는다 — 뒤로가기가 탭 사이를 오가는 데 쓰이면
    // 이 화면을 벗어나려는 사람이 여러 번 눌러야 한다.
    setParams(nextParams, { replace: true });
  };

  const query = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  /*
    **삭제됨도 늘 불러 둔다.** 탭에 개수를 적으려면 열기 전에 알아야 하고, 그 숫자가 곧
    "되살릴 것이 있다" 는 신호다 — 게시판은 몇 줄뿐이라 한 번 더 부르는 값이 싸다.
  */
  const deletedQuery = useQuery({
    queryKey: ['boards', 'deleted'],
    queryFn: listDeletedBoards,
  });

  const deleted = tab === 'deleted';
  const rows: (Board | DeletedBoard)[] = deleted
    ? (deletedQuery.data ?? [])
    : (query.data ?? []);
  const loading = deleted ? deletedQuery.isLoading : query.isLoading;

  const remove = useMutation({
    mutationFn: (board: Board) => deleteBoard(board.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['boards'] });
      setRemoving(null);
      /*
        **지운 뒤에는 지운 것을 보여 준다.** 목록에서 사라지기만 하면 정말 없어진 줄 알게
        되는데, 이건 되돌릴 수 있는 삭제다 — 어디로 갔는지 그 자리에서 보인다.
      */
      setTab('deleted');
    },
    onError: (e) => {
      setRemoving(null);
      setError(errorMessage(e, '삭제하지 못했습니다.'));
    },
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

      {/*
        **표는 하나를 같이 쓴다.** 지운 게시판도 결국 같은 게시판이라 볼 것이 같다 — 목록을
        따로 만들면 열이 어긋나고, 어느 쪽을 보고 있는지도 흐려진다. 탭이 그 자리를 대신한다.
      */}
      <div className="mb-3 flex items-center gap-1 border-b border-gray-200">
        <Tab active={!deleted} onClick={() => setTab('active')}>
          게시판 {query.data ? `(${query.data.length})` : ''}
        </Tab>
        <Tab active={deleted} onClick={() => setTab('deleted')}>
          삭제됨 {deletedQuery.data ? `(${deletedQuery.data.length})` : ''}
        </Tab>
      </div>

      <Table
        columns={COLUMNS}
        head={[
          'ID',
          '제목',
          '이름',
          '글쓰기',
          '기능',
          '글',
          deleted ? '삭제일' : '공개',
          '',
        ]}
      >
        {loading && <Empty>불러오는 중…</Empty>}
        {!loading && rows.length === 0 && (
          <Empty>
            {deleted
              ? '지운 게시판이 없습니다.'
              : '아직 게시판이 없습니다. 오른쪽 위에서 추가하세요.'}
          </Empty>
        )}
        {rows.map((board) => (
          <div
            key={board.id}
            /*
              삭제됨 탭에서는 줄 어디를 눌러도 복구창이 열린다 — 되살리기 말고는 할 일이
              없는 줄이라, 작은 버튼을 정확히 겨냥하게 만들 이유가 없다.
            */
            onClick={
              deleted
                ? () => setRestoring(board as DeletedBoard)
                : undefined
            }
            className={cn(
              'grid items-center border-b border-gray-100 py-3 last:border-0',
              deleted && 'cursor-pointer hover:bg-gray-50',
              COLUMNS,
            )}
          >
            <span className="font-mono text-sm text-gray-400">{board.id}</span>

            <span className="min-w-0">
              {/* 제목을 누르면 그 게시판의 글 목록으로 간다. 지운 게시판은 갈 곳이 없다. */}
              {deleted ? (
                <span className="block truncate text-sm font-semibold text-gray-500">
                  {board.title}
                </span>
              ) : (
                <Link
                  to={`/boards/${board.id}/posts`}
                  className="block truncate text-sm font-semibold text-gray-900 hover:text-primary"
                >
                  {board.title}
                </Link>
              )}
              {board.description && (
                <span className="block truncate text-xs text-gray-400">
                  {board.description}
                </span>
              )}
            </span>

            <span
              className="truncate font-mono text-xs text-gray-500"
              /* 지운 이름(notice_12_deleted)은 사람이 볼 값이 아니라 툴팁에만 남긴다. */
              title={deleted ? board.name : undefined}
            >
              {deleted ? (board as DeletedBoard).suggestedName : board.name}
            </span>

            <span className="text-sm text-gray-600">
              {board.writeRole === 'ADMIN' ? '관리자만' : '회원'}
            </span>

            {/* 켜진 것만 보여준다 — 꺼진 것까지 늘어놓으면 어느 게시판이 다른지 안 보인다. */}
            <span className="flex flex-wrap gap-1">
              {board.commentEnabled && <Badge tone="blue">댓글</Badge>}
              {board.likeEnabled && <Badge tone="blue">좋아요</Badge>}
              {board.secretPostEnabled && <Badge tone="amber">비공개 글</Badge>}
              {board.secretCommentEnabled && (
                <Badge tone="amber">비공개 댓글</Badge>
              )}
              {!board.commentEnabled &&
                !board.likeEnabled &&
                !board.secretPostEnabled &&
                !board.secretCommentEnabled && (
                  <span className="text-xs text-gray-300">—</span>
                )}
            </span>

            <span className="text-sm text-gray-500">{board.postCount}</span>

            <span>
              {deleted ? (
                <span className="text-xs text-gray-400">
                  {splitDateTime((board as DeletedBoard).deletedAt)?.date}
                </span>
              ) : board.status === 'ACTIVE' ? (
                <Badge tone="green">공개</Badge>
              ) : (
                <Badge tone="gray">숨김</Badge>
              )}
            </span>

            {/*
              **아이콘만 두되 이름은 남긴다.** 표 한 줄에 글자가 늘어서면 제목보다 버튼이
              먼저 읽힌다 — 대신 title·aria-label 로 무엇인지 알 수 있게 한다.
            */}
            <span className="flex justify-end gap-1">
              {deleted ? (
                <button
                  type="button"
                  onClick={() => setRestoring(board as DeletedBoard)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  복구
                </button>
              ) : (
                <>
              <button
                type="button"
                onClick={() => setEditing(board)}
                title="게시판 설정"
                aria-label="게시판 설정"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
              >
                <Settings className="h-4 w-4" />
              </button>
              {/*
                **글이 있어도 지울 수 있다.** 지우기는 소프트 삭제라 행이 남는다 — 그전에는
                되돌릴 수 없어서 글이 있으면 아예 막아 뒀다.
              */}
              <button
                type="button"
                disabled={remove.isPending}
                title="게시판 삭제"
                aria-label="게시판 삭제"
                onClick={() => {
                  setError(null);
                  setRemoving(board);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-200 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
                </>
              )}
            </span>
          </div>
        ))}
      </Table>

      {removing && (
        <ConfirmDialog
          title="게시판 삭제"
          confirmLabel="삭제"
          tone="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        >
          <p>
            <b>{removing.title}</b> 게시판을 목록에서 내립니다.
            {removing.postCount > 0 && (
              <>
                {' '}
                안에 있는 글 <b>{removing.postCount}개</b>도 함께 보이지 않게
                됩니다.
              </>
            )}
          </p>
          <p className="mt-2">
            데이터는 남아 있습니다. 이름 <b>{removing.name}</b> 은 놓아 주므로
            같은 이름으로 다시 만들 수 있습니다.
          </p>
        </ConfirmDialog>
      )}

      {restoring && (
        <RestoreBoardModal
          board={restoring}
          onClose={() => setRestoring(null)}
          // 되살린 게시판은 이제 활성 쪽에 있다. 삭제됨 탭에 남으면 성공했는지 알 수 없다.
          onRestored={() => setTab('active')}
        />
      )}

      {creating && <BoardModal onClose={() => setCreating(false)} />}
      {editing && (
        <BoardModal board={editing} onClose={() => setEditing(null)} />
      )}
    </AdminLayout>
  );
}

/** 표 위의 탭. 밑줄로 지금 보고 있는 쪽을 가리킨다. */
function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-gray-500 hover:text-gray-800',
      )}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-gray-400">
      {children}
    </div>
  );
}
