import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Link2, MessageSquare, ThumbsUp } from 'lucide-react';

import { getPost, listBoards, type Comment } from '@/shared/api/boards';
import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { cn } from '@/shared/lib/cn';
import { MarkdownViewer } from '@/shared/ui/MarkdownViewer';
import { PAGE_CONTAINER } from '@/shared/ui/layout';

/**
 * 글 하나. **카페 글 상세의 관례를 따른다** — 게시판 이름, 제목, 글쓴이 줄, 본문,
 * 반응 줄, 댓글 순이다. 처음 보는 사람도 어디에 무엇이 있는지 짐작할 수 있는 배치다.
 */
export default function BoardPost() {
  const { name, id } = useParams() as { name: string; id: string };
  const [copied, setCopied] = useState(false);

  const boards = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  const board = boards.data?.find((b) => b.name === name);

  const query = useQuery({
    queryKey: ['post', name, id],
    queryFn: () => getPost(name, Number(id)),
  });
  const post = query.data;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    // 눌렀다는 표시는 잠깐이면 된다. 되돌리지 않으면 다음에 눌러도 바뀐 게 없어 보인다.
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className={cn(PAGE_CONTAINER, 'flex-1 py-8')}>
        <article className="rounded-2xl border border-gray-200 bg-white">
          <header className="px-6 pt-6 pb-4 sm:px-8">
            {/* 게시판 이름. 누르면 그 게시판 목록으로 돌아간다. */}
            <Link
              to={`/board/${name}`}
              className="inline-flex items-center text-sm font-semibold text-primary hover:underline"
            >
              {board?.title ?? '게시판'}
              <ChevronRight className="h-4 w-4" />
            </Link>

            <h1 className="mt-2 flex items-start gap-2 text-2xl font-bold text-gray-900">
              {post?.pinned && (
                <span className="mt-1 shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-600">
                  공지
                </span>
              )}
              <span>{post?.title ?? ''}</span>
            </h1>

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
                    {post.publishedAt?.replace('T', ' ').slice(0, 16)}
                    {` · 조회 ${post.viewCount}`}
                  </span>
                </span>

                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <MessageSquare className="h-4 w-4" />
                  댓글 {post.commentCount}
                </span>
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="text-sm text-gray-500 transition hover:text-gray-900"
                >
                  {copied ? '복사됨' : 'URL 복사'}
                  <Link2 className="ml-1 inline h-4 w-4" />
                </button>
              </div>
            )}
          </header>

          <div className="border-t border-gray-100 px-6 py-8 sm:px-8">
            {query.isLoading && (
              <p className="py-16 text-center text-sm text-gray-400">
                불러오는 중…
              </p>
            )}
            {/*
              비공개 글이면 본문이 **응답에 아예 없다**. 화면에서 가리는 것이 아니라 서버가
              안 보내는 것이라, 개발자도구를 열어도 나오지 않는다.
            */}
            {post &&
              (post.content ? (
                <MarkdownViewer markdown={post.content} />
              ) : (
                <p className="py-16 text-center text-sm text-gray-400">
                  비공개 글입니다. 쓴 사람만 볼 수 있습니다.
                </p>
              ))}
          </div>

          {/* 반응 줄. 좋아요는 아직 없어 숫자를 보여줄 것이 없다(아래 주석 참고). */}
          {post && (
            <div className="flex items-center justify-center gap-6 border-t border-gray-100 py-4 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <ThumbsUp className="h-4 w-4" />
                좋아요
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                댓글 {post.commentCount}
              </span>
            </div>
          )}

          {/* 댓글 영역. 게시판이 댓글을 끈 곳에서는 통째로 없다. */}
          {post && board?.commentEnabled && (
            <section className="border-t border-gray-100 px-6 py-6 sm:px-8">
              <h2 className="text-sm font-bold text-gray-900">
                댓글 {post.commentCount}
              </h2>
              {post.comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  아직 댓글이 없습니다.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-gray-100">
                  {post.comments.map((comment) => (
                    <CommentRow key={comment.id} comment={comment} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </article>

        <div className="mt-6 text-center">
          <Link
            to={`/board/${name}`}
            className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            목록
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** 댓글 한 줄. 답글(parentId)은 한 칸 들여 쓴다. */
function CommentRow({ comment }: { comment: Comment }) {
  return (
    <li className={cn('flex gap-3 py-4', comment.parentId && 'pl-10')}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
        {comment.author.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">
          {comment.author.name}
          <span className="ml-2 text-xs font-normal text-gray-400">
            {comment.createdAt.replace('T', ' ').slice(0, 16)}
          </span>
        </p>
        <p className="mt-1 text-sm whitespace-pre-line text-gray-700">
          {comment.content ?? (
            <span className="text-gray-400">비공개 댓글입니다.</span>
          )}
        </p>
      </div>
    </li>
  );
}
