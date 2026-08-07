import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';

import { listUsers, type UserStatus } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import { TextField } from '@/shared/ui/TextField';
import { STATUS_LABEL, STATUS_TONE } from '../statusTone';

/**
 * 목록 칸의 시각. **날짜와 시각을 두 줄로 나눈다.**
 * 관리 화면이라 초까지 보여야 하는데, 한 줄로 두면 20자라 열이 그만큼 넓어져
 * 정작 봐야 할 이메일 칸이 밀린다.
 */
function DateTimeCell({ iso }: { iso: string }) {
  const parts = splitDateTime(iso);
  if (!parts) return <span className="text-sm text-gray-400">—</span>;
  return (
    <span className="text-sm text-gray-500">
      {parts.date}
      <span className="block text-xs text-gray-400">{parts.time}</span>
    </span>
  );
}

/** 표 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS =
  'grid-cols-[64px_minmax(0,1fr)_140px_88px_100px_150px_32px] gap-4 px-6';

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: UserStatus | ''; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'ACTIVE', label: '활성' },
  { value: 'SUSPENDED', label: '정지' },
  { value: 'WITHDRAWN', label: '탈퇴' },
];

/**
 * 회원 목록.
 *
 * **페이지·검색어를 URL 쿼리에 둔다.** 새로고침해도 보던 페이지가 유지되고, 링크를
 * 그대로 남에게 보낼 수 있다. 컴포넌트 state 로만 들고 있으면 둘 다 안 된다.
 */
export default function Users() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const keyword = params.get('keyword') ?? '';
  const status = (params.get('status') ?? '') as UserStatus | '';

  // 입력 중인 검색어는 URL 과 분리한다 — 글자마다 URL 이 바뀌면 뒤로가기가 못 쓰게 된다.
  const [draft, setDraft] = useState(keyword);

  const query = useQuery({
    queryKey: ['users', { page, keyword, status }],
    queryFn: () =>
      listUsers({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        status: status || undefined,
      }),
    // 페이지를 넘길 때 표가 빈 화면으로 깜빡이지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  });

  /** 조건을 바꾼다. **페이지는 1로 되돌린다** — 3페이지에서 검색하면 결과가 1페이지뿐인데
   *  3페이지를 요청해 빈 목록이 나온다. */
  const applyFilter = (next: { keyword?: string; status?: string }) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    merged.delete('page');
    setParams(merged);
  };

  const goPage = (next: number) => {
    const merged = new URLSearchParams(params);
    merged.set('page', String(next));
    setParams(merged);
    window.scrollTo({ top: 0 });
  };

  const data = query.data;

  return (
    <AdminLayout
      title="회원"
      description="가입한 회원을 조회합니다. 최근 가입 순입니다."
      breadcrumbs={[{ label: '회원' }]}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilter({ keyword: draft, status });
          }}
        >
          <TextField
            placeholder="이메일 또는 이름"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-64"
          />
          {/* Button 기본은 w-full 이다. 툴바 버튼이라 내용 너비로 되돌린다. */}
          <Button type="submit" variant="outline" className="w-auto shrink-0">
            <Search className="h-4 w-4" />
            검색
          </Button>
        </form>

        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              onClick={() => applyFilter({ keyword, status: f.value })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition',
                status === f.value
                  ? 'bg-primary-50 font-semibold text-primary-700'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '회원 목록을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          {keyword || status
            ? '조건에 맞는 회원이 없습니다.'
            : '가입한 회원이 없습니다.'}
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['id', '이메일', '이름', '상태', '등급', '가입일', '']}
          >
            {data.items.map((user) => (
              <Link
                key={user.id}
                to={`/users/${user.id}`}
                className={cn(
                  'grid items-center border-b border-gray-100 py-3.5 transition last:border-0 hover:bg-gray-50',
                  COLUMNS,
                )}
              >
                <span className="font-mono text-sm text-gray-400">
                  {user.id}
                </span>
                <span className="truncate font-medium text-gray-900">
                  {user.email}
                  {!user.emailVerified && (
                    <span className="ml-1.5 text-xs text-amber-500">미인증</span>
                  )}
                </span>
                <span className="truncate text-sm text-gray-600">
                  {user.name ?? '—'}
                </span>
                <span>
                  <Badge tone={STATUS_TONE[user.status]}>
                    {STATUS_LABEL[user.status]}
                  </Badge>
                </span>
                <span className="text-sm text-gray-500">{user.tier}</span>
                <DateTimeCell iso={user.createdAt} />
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </Link>
            ))}
          </Table>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            totalCount={data.totalCount}
            onChange={goPage}
          />
        </>
      )}
    </AdminLayout>
  );
}
