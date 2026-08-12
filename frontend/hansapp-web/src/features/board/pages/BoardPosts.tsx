import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';

import { listBoards, listPosts } from '@/shared/api/boards';
import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { cn } from '@/shared/lib/cn';
import { PAGE_CONTAINER } from '@/shared/ui/layout';

/**
 * 열 폭. 머리글과 각 행이 **같은 값**을 써야 세로줄이 맞는다.
 * 좁은 화면에서는 작성자·작성일을 접고 제목만 남긴다.
 */
const COLUMNS =
  'grid-cols-[minmax(0,1fr)_100px] sm:grid-cols-[70px_minmax(0,1fr)_120px_110px_80px] gap-3 px-4 sm:px-6';

/** 한 페이지에 몇 개. 서버가 받는 상한(50)을 넘지 않는다. */
const SIZES = [15, 30, 50];

/**
 * 게시판 글 목록.
 *
 * 주소는 `/board/notice` 처럼 **게시판 이름**으로 간다 — 번호를 노출하면 게시판이 몇 개인지·
 * 언제 만들어졌는지가 그대로 드러난다.
 */
export default function BoardPosts() {
  const name = useParams().name as string;
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(15);

  const boards = useQuery({ queryKey: ['boards'], queryFn: listBoards });
  const board = boards.data?.find((b) => b.name === name);

  const query = useQuery({
    queryKey: ['posts', name, page, size],
    queryFn: () => listPosts(name, page, size),
  });
  const rows = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className={cn(PAGE_CONTAINER, 'flex-1 py-8')}>
        <h1 className="text-2xl font-bold text-gray-900">
          {board?.title ?? '게시판'}
        </h1>
        {board?.description && (
          <p className="mt-1 text-sm text-gray-500">{board.description}</p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            <strong className="font-bold text-gray-900">
              {(query.data?.totalCount ?? 0).toLocaleString()}
            </strong>
            개의 글
          </p>
          {/*
            한 페이지에 몇 개. 고르면 1페이지로 돌아간다 — 3페이지에서 개수를 늘리면
            그 페이지가 아예 없어질 수 있다.
          */}
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700"
          >
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}개씩
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {/* 머리글. 좁은 화면에서는 제목·작성일만 남는다. */}
          <div
            className={cn(
              'grid border-b border-gray-200 bg-gray-50 py-3 text-xs font-semibold text-gray-500',
              COLUMNS,
            )}
          >
            <span className="hidden text-center sm:block">글번호</span>
            <span className="text-center">제목</span>
            <span className="hidden text-center sm:block">작성자</span>
            <span className="text-center">작성일</span>
            <span className="hidden text-center sm:block">조회수</span>
          </div>

          {query.isLoading && <Empty>불러오는 중…</Empty>}
          {!query.isLoading && rows.length === 0 && (
            <Empty>아직 글이 없습니다.</Empty>
          )}

          {rows.map((post) => (
            <Link
              key={post.id}
              to={`/board/${name}/${post.id}`}
              className={cn(
                'grid items-center border-b border-gray-100 py-3 transition last:border-0 hover:bg-gray-50',
                COLUMNS,
              )}
            >
              {/* 고정 글은 번호 대신 '공지' 로 보인다 — 목록 순서와 번호가 어긋나 보이지 않게. */}
              <span className="hidden text-center text-sm text-gray-400 sm:block">
                {post.pinned ? (
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-600">
                    공지
                  </span>
                ) : (
                  post.id
                )}
              </span>

              <span className="flex min-w-0 items-center gap-1.5">
                {post.secret && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                <span className="truncate text-sm font-medium text-gray-900">
                  {post.title}
                </span>
                {post.commentCount > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    [{post.commentCount}]
                  </span>
                )}
              </span>

              <span className="hidden truncate text-center text-sm text-gray-500 sm:block">
                {post.author.name}
              </span>

              <span className="text-center text-sm text-gray-400">
                {post.publishedAt?.slice(0, 10).replace(/-/g, '.')}
              </span>

              <span className="hidden text-center text-sm text-gray-400 sm:block">
                {post.viewCount.toLocaleString()}
              </span>
            </Link>
          ))}
        </div>

        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onMove={setPage} />
        )}

      </main>
      <Footer />
    </div>
  );
}

/**
 * 페이지 번호.
 *
 * **한 번에 다섯 개씩만 보인다.** 글이 쌓이면 번호가 수십 개가 되는데 전부 늘어놓으면
 * 줄이 넘치고 지금 어디인지도 안 보인다.
 */
function Pagination({
  page,
  totalPages,
  onMove,
}: {
  page: number;
  totalPages: number;
  onMove: (next: number) => void;
}) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const numbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, i) => start + i,
  );

  return (
    <nav className="mt-6 flex items-center justify-center gap-1 text-sm">
      <PageButton disabled={page <= 1} onClick={() => onMove(page - 1)}>
        이전
      </PageButton>
      {numbers.map((n) => (
        <PageButton key={n} current={n === page} onClick={() => onMove(n)}>
          {String(n)}
        </PageButton>
      ))}
      <PageButton disabled={page >= totalPages} onClick={() => onMove(page + 1)}>
        다음
      </PageButton>
    </nav>
  );
}

function PageButton({
  current = false,
  disabled = false,
  onClick,
  children,
}: {
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'h-9 min-w-9 rounded-lg border px-3 transition disabled:opacity-40',
        current
          ? 'border-primary bg-primary font-bold text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="px-5 py-12 text-center text-sm text-gray-400">
      {children}
    </div>
  );
}
