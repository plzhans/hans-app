import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { listBoards } from '@/shared/api/boards';
import { deletePost, getPost } from '@/shared/api/posts';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { MarkdownViewer } from '@/shared/ui/MarkdownViewer';
import { PostCachePanel } from '../PostCachePanel';

/**
 * 글 보기.
 *
 * **편집과 화면을 나눈다.** 목록에서 누르는 대부분의 이유는 "무슨 내용이더라" 를 확인하는
 * 것인데, 곧바로 편집기가 열리면 본문이 마크다운 원문으로 보이고 실수로 고칠 여지도 생긴다.
 *
 * **포털 상세와 같은 배치로 그린다**(hansapp-web 의 BoardPost — 게시판 이름, 제목, 글쓴이
 * 줄, 본문 순). 여기서 확인하려는 것은 "사람들에게 어떻게 보이나" 인데, 콘솔에서만 다른
 * 모양으로 보여 주면 그 확인이 안 된다.
 */
export default function PostView() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // 탭은 주소에 적는다 — 캐시를 보다 새로고침해도 그 자리에 남는다.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'cache' ? 'cache' : 'content';
  const setTab = (next: 'content' | 'cache') => {
    const nextParams = new URLSearchParams(params);
    if (next === 'content') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  const query = useQuery({ queryKey: ['post', id], queryFn: () => getPost(id) });
  const post = query.data;

  const boards = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  const board = boards.data?.find((b) => b.id === post?.boardId);

  const remove = useMutation({
    mutationFn: () => deletePost(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['posts', post?.boardId] });
      navigate(`/boards/${post?.boardId}/posts`);
    },
    onError: (e) => {
      setAsking(false);
      setError(errorMessage(e, '삭제하지 못했습니다.'));
    },
  });

  const published = splitDateTime(post?.publishedAt);

  return (
    <AdminLayout
      title={post?.title ?? ''}
      breadcrumbs={[
        { label: '커뮤니티' },
        { label: '게시판', to: '/boards' },
        ...(post
          ? [
              {
                label: board?.title ?? '게시판',
                to: `/boards/${post.boardId}/posts`,
              },
            ]
          : []),
        { label: '보기' },
      ]}
      actions={
        post && (
          <>
            {/* 상위 목록으로 가는 것은 어느 화면이든 `‹ 목록` 하나다. */}
            <Link
              to={`/boards/${post.boardId}/posts`}
              className="mr-auto inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white pr-3 pl-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              목록
            </Link>
            {/*
              **자주 쓰는 것이 커서에 가깝다.** 오른쪽 정렬이라 오른쪽 끝이 그 자리다 —
              수정을 맨 오른쪽에, 삭제를 그 왼쪽에 둔다(잘못 눌러 지우는 일도 줄어든다).
              캐싱 지우기는 캐싱 탭 안으로 들어갔다 — 무엇을 지우는지 보고 누르는 일이다.
            */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAsking(true);
              }}
              className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              삭제
            </button>
            <Link
              to={`/posts/${id}/edit`}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              수정
            </Link>
          </>
        )
      }
    >
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/*
        **본문과 캐싱을 나눈다.** 캐시는 글을 읽으러 온 사람에게는 소음이고, 캐시를 보러 온
        사람에게는 본문이 소음이다 — 한 화면에 겹쳐 두면 둘 다 잘 안 보인다.
      */}
      <div className="mb-3 flex items-center gap-1 border-b border-gray-200">
        <Tab active={tab === 'content'} onClick={() => setTab('content')}>
          본문
        </Tab>
        <Tab active={tab === 'cache'} onClick={() => setTab('cache')}>
          캐싱
        </Tab>
      </div>

      {tab === 'cache' ? (
        <PostCachePanel postId={id} />
      ) : (
        <article className="rounded-2xl border border-gray-200 bg-white">
          <header className="px-6 pt-6 pb-4 sm:px-8">
            {/* 게시판 이름. 누르면 그 게시판의 글 목록으로 돌아간다(포털과 같다). */}
            {board && post ? (
              <Link
                to={`/boards/${post.boardId}/posts`}
                className="inline-flex items-center text-sm font-semibold text-primary hover:underline"
              >
                {board.title}
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="block h-5" />
            )}

            {post && (
              <h1 className="mt-2 flex items-start gap-2 text-2xl font-bold text-gray-900">
                {post.pinned && (
                  <span className="mt-1 shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-600">
                    공지
                  </span>
                )}
                <span>{post.title}</span>
              </h1>
            )}

            {post && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* 프로필 아이콘. 사진이 없으니 이름 첫 글자로 대신한다. */}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                  {post.author.name.slice(0, 1)}
                </span>
                <span className="mr-auto">
                  <span className="block text-sm font-semibold text-gray-900">
                    {post.author.name}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {published
                      ? `${published.date} ${published.time}`
                      : '공개 전'}
                    {` · 조회 ${post.viewCount}`}
                  </span>
                </span>

                {/*
                  **이 줄만 포털에 없다.** 포털은 공개된 글만 보므로 상태를 말할 필요가
                  없지만, 콘솔에서는 이 글이 지금 어떤 상태인지가 보러 온 이유일 때가 많다.
                  글이 스스로 정한 것만 배지로 — null(게시판 따름)은 예외가 아니라 기본이다.
                */}
                {post.status === 'PUBLISHED' ? (
                  <Badge tone="green">공개</Badge>
                ) : (
                  <Badge tone="gray">
                    {post.status === 'DRAFT' ? '작성 중' : '숨김'}
                  </Badge>
                )}
                {post.secret && <Badge tone="amber">비공개</Badge>}
                {post.commentEnabled === false && (
                  <Badge tone="gray">댓글 닫음</Badge>
                )}
                {post.likeEnabled === false && (
                  <Badge tone="gray">좋아요 닫음</Badge>
                )}
              </div>
            )}
          </header>

          <div className="border-t border-gray-100 px-6 py-8 sm:px-8">
            {query.isLoading && (
              <p className="py-16 text-center text-sm text-gray-400">
                불러오는 중…
              </p>
            )}
            {post && <MarkdownViewer markdown={post.content} />}
          </div>
        </article>
      )}

      {asking && post && (
        <ConfirmDialog
          title="글 삭제"
          confirmLabel="삭제"
          tone="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setAsking(false)}
        >
          <p>
            <b>{post.title}</b> 글을 목록에서 내립니다.
          </p>
          <p className="mt-2">
            데이터는 남습니다. 잠시 감추려는 것이라면 수정 화면에서 상태를{' '}
            <b>숨김</b>으로 바꾸는 쪽이 낫습니다 — 그건 목록에 계속 보입니다.
          </p>
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}

/** 본문 위의 탭. 밑줄로 지금 보고 있는 쪽을 가리킨다(게시판 목록과 같은 모양). */
function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
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
