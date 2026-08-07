import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';

import { listApps, type AppStatus } from '@/shared/api/apps';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { splitDateTime } from '@/shared/lib/formatDateTime';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import { TextField } from '@/shared/ui/TextField';
import {
  DISPLAY_LABEL,
  DISPLAY_TONE,
  STATUS_FILTERS,
  displayStatus,
} from '../appStatus';

/** 목록 칸의 시각. 날짜·시각을 두 줄로 나눠 초까지 보여 준다(회원 목록과 같은 규칙). */
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
  'grid-cols-[64px_minmax(0,1fr)_minmax(0,180px)_88px_64px_64px_150px_32px] gap-4 px-6';

const PAGE_SIZE = 20;

/**
 * 앱 목록.
 *
 * 회원 목록과 같은 규칙이다 — 페이지·검색어를 URL 쿼리에 두어 새로고침해도 유지되고
 * 링크를 그대로 공유할 수 있다.
 */
export default function Apps() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const keyword = params.get('keyword') ?? '';
  const status = (params.get('status') ?? '') as AppStatus | '';
  const includeDeleted = params.get('deleted') === '1';

  const [draft, setDraft] = useState(keyword);

  const query = useQuery({
    queryKey: ['apps', { page, keyword, status, includeDeleted }],
    queryFn: () =>
      listApps({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        status: status || undefined,
        includeDeleted,
      }),
    placeholderData: keepPreviousData,
  });

  /** 조건을 바꾼다. **페이지는 1로 되돌린다** — 안 그러면 결과보다 큰 페이지를 요청해 빈 목록이 나온다. */
  const applyFilter = (next: Record<string, string | undefined>) => {
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
      title="앱"
      description="개발자가 등록한 앱을 조회합니다. 최근 등록 순입니다."
      breadcrumbs={[{ label: '앱' }]}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilter({ keyword: draft });
          }}
        >
          <TextField
            placeholder="앱 이름 또는 소유자 이메일"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-72"
          />
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
              onClick={() => applyFilter({ status: f.value })}
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

        {/* 삭제된 앱은 다른 축이라 상태 필터와 나란히 두지 않고 체크박스로 뺀다. */}
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-primary"
            checked={includeDeleted}
            onChange={(e) =>
              applyFilter({ deleted: e.target.checked ? '1' : undefined })
            }
          />
          삭제된 앱 포함
        </label>
      </div>

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '앱 목록을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          {keyword || status
            ? '조건에 맞는 앱이 없습니다.'
            : '등록된 앱이 없습니다.'}
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['id', '앱 이름', '소유자', '상태', '키', '클라', '등록일', '']}
            minWidth="min-w-[900px]"
          >
            {data.items.map((app) => {
              const display = displayStatus(app);
              return (
                <Link
                  key={app.id}
                  to={`/apps/${app.id}`}
                  className={cn(
                    'grid items-center border-b border-gray-100 py-3.5 transition last:border-0 hover:bg-gray-50',
                    COLUMNS,
                    // 삭제된 앱은 흐리게 — 목록에 섞여 있어도 한눈에 갈린다.
                    app.deletedAt && 'opacity-60',
                  )}
                >
                  <span className="font-mono text-sm text-gray-400">
                    {app.id}
                  </span>
                  <span className="truncate font-medium text-gray-900">
                    {app.name}
                  </span>
                  <span className="truncate text-sm text-gray-600">
                    {app.owner?.email ?? '—'}
                  </span>
                  <span>
                    <Badge tone={DISPLAY_TONE[display]}>
                      {DISPLAY_LABEL[display]}
                    </Badge>
                  </span>
                  <span className="text-sm text-gray-500">
                    {app.apiKeyCount}
                  </span>
                  <span className="text-sm text-gray-500">
                    {app.clientCount}
                  </span>
                  <DateTimeCell iso={app.createdAt} />
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </Link>
              );
            })}
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
