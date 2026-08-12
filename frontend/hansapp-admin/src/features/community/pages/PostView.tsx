import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';

import { listBoards } from '@/shared/api/boards';
import { deletePost, getPost, purgePostCache } from '@/shared/api/posts';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { MarkdownViewer } from '@/shared/ui/MarkdownViewer';

/**
 * 글 보기.
 *
 * **편집과 화면을 나눈다.** 목록에서 누르는 대부분의 이유는 "무슨 내용이더라" 를 확인하는
 * 것인데, 곧바로 편집기가 열리면 본문이 마크다운 원문으로 보이고 실수로 고칠 여지도 생긴다.
 * 고칠 때만 편집 화면으로 간다.
 */
export default function PostView() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<'purge' | 'delete' | null>(null);

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
      setAsking(null);
      setError(errorMessage(e, '삭제하지 못했습니다.'));
    },
  });

  const purge = useMutation({
    mutationFn: () => purgePostCache(id),
    onSuccess: () => setAsking(null),
    onError: (e) => {
      setAsking(null);
      setError(errorMessage(e, '캐싱을 지우지 못했습니다.'));
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
            {/*
              **상위 목록으로 가는 것은 뒤로가기와 같은 몸짓이다.** 화면마다 "글 목록"·
              "게시판 목록" 으로 이름이 갈리면 매번 읽고 판단해야 한다 — 어디서든
              `‹ 목록` 하나로 두면 읽지 않고도 누른다. 옮길 말이 하나로 줄어드는 것은 덤이다.
            */}
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
              왼쪽 정렬인 줄에서는 반대로 왼쪽 끝이 그 자리다.
            */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAsking('purge');
              }}
              className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              {purge.isSuccess ? '캐싱 지움' : '캐싱 지우기'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAsking('delete');
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

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-6 py-4 text-sm text-gray-500">
          {/* 켜진 것만 배지로. 꺼진 것까지 늘어놓으면 무엇이 다른지 안 보인다. */}
          {post?.status === 'PUBLISHED' ? (
            <Badge tone="green">공개</Badge>
          ) : (
            post && (
              <Badge tone="gray">
                {post.status === 'DRAFT' ? '작성 중' : '숨김'}
              </Badge>
            )
          )}
          {post?.pinned && <Badge tone="blue">고정</Badge>}
          {post?.secret && <Badge tone="amber">비공개</Badge>}
          {post?.commentEnabled && <Badge tone="blue">댓글</Badge>}

          <span className="ml-auto">
            {post?.author.name}
            {published && ` · ${published.date} ${published.time}`}
            {post && ` · 조회 ${post.viewCount}`}
          </span>
        </div>

        <div className="px-6 py-6">
          {query.isLoading && (
            <p className="py-16 text-center text-sm text-gray-400">
              불러오는 중…
            </p>
          )}
          {post && <MarkdownViewer markdown={post.content} />}
        </div>
      </div>

      {asking === 'purge' && (
        <ConfirmDialog
          title="캐싱 지우기"
          confirmLabel="지우기"
          loading={purge.isPending}
          onConfirm={() => purge.mutate()}
          onClose={() => setAsking(null)}
        >
          <p>
            이 글의 <b>공개 화면 캐시</b>를 지웁니다. 지운 직후의 조회는 캐시를
            타지 않고 DB 로 내려갑니다.
          </p>
          <p className="mt-2">
            글을 저장할 때 서버가 이미 지우므로 평소에는 누를 일이 없습니다.
            게시판 설정만 바꿨거나, 고친 내용이 공개 화면에 안 보일 때만
            쓰세요.
          </p>
        </ConfirmDialog>
      )}

      {asking === 'delete' && post && (
        <ConfirmDialog
          title="글 삭제"
          confirmLabel="삭제"
          tone="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setAsking(null)}
        >
          <p>
            <b>{post.title}</b> 글을 지웁니다.
          </p>
          <p className="mt-2">
            달린 댓글도 함께 사라지며 <b>되돌릴 수 없습니다.</b> 잠시 감추려는
            것이라면 수정 화면에서 상태를 <b>숨김</b>으로 바꾸세요.
          </p>
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}
