import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';

import { listHiraMirrorHospitals, listNmcMirrorHospitals } from '@/shared/api/mirrors';
import type { PageResponse } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import { TextField } from '@/shared/ui/TextField';

const PAGE_SIZE = 20;

type Source = 'hira' | 'nmc';

const SOURCE_LABEL: Record<Source, string> = {
  hira: 'HIRA(심사평가원)',
  nmc: 'NMC(국립중앙의료원)',
};

/** 각 원본의 기본키 이름. "id" 로 뭉뚱그리면 헷갈린다 — HIRA·NMC 가 쓰는 실제 이름 그대로. */
const ID_LABEL: Record<Source, string> = {
  hira: '요양기호',
  nmc: 'hpid',
};

/** HIRA(ykiho)·NMC(hpid) 목록 응답을 같은 모양으로 맞춘다 — 표 렌더 하나로 두 소스를 그린다. */
interface MirrorListRow {
  id: string;
  name?: string | null;
  addr?: string | null;
  tel?: string | null;
  sidoNm?: string | null;
  sgguNm?: string | null;
  syncedAt: string;
}

async function fetchRows(
  source: Source,
  page: number,
  keyword: string,
): Promise<PageResponse<MirrorListRow>> {
  if (source === 'hira') {
    const res = await listHiraMirrorHospitals({ page, size: PAGE_SIZE, keyword: keyword || undefined });
    return { ...res, items: res.items.map((row) => ({ ...row, id: row.ykiho })) };
  }
  const res = await listNmcMirrorHospitals({ page, size: PAGE_SIZE, keyword: keyword || undefined });
  return { ...res, items: res.items.map((row) => ({ ...row, id: row.hpid })) };
}

/** 목록 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS = 'grid-cols-[minmax(0,1fr)_140px_110px_150px_120px_32px] gap-4 px-6';

/**
 * 연동 데이터(HIRA·NMC 미러) 병원 목록. source 로 HIRA/NMC 를 갈라 각자 라우트
 * (/hira/hospitals, /nmc/hospitals)를 받는다 — 대시보드의 "목록 보기" 가 여기로 온다.
 *
 * **healthcare_hospital(통합병원)과 무관하다.** 관리자가 원본(hira_hospital/nmc_hospital)
 * 자체를 병원명·id 로 찾아보는 자리다 — 통합이 잘못됐는지 원본이 애초에 그런지 가릴 때 쓴다.
 *
 * **검색은 병원명(또는 id) 중심이다.** 지역·종별 코드 필터는 서버가 이미 받지만(백엔드
 * DTO 참고), 목록 화면은 우선 이름 검색 하나로 좁혔다 — HIRA 는 코드, NMC 는 지명 문자열로
 * 체계가 달라 지역 드롭다운을 만들려면 별도 이름표(meta)가 필요해서다.
 */
export default function MirrorHospitals({ source }: { source: Source }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const keyword = params.get('keyword') ?? '';

  const [draft, setDraft] = useState(keyword);

  const query = useQuery({
    queryKey: ['mirror-hospitals', source, page, keyword],
    queryFn: () => fetchRows(source, page, keyword),
    placeholderData: keepPreviousData,
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const merged = new URLSearchParams(params);
    if (draft.trim()) merged.set('keyword', draft.trim());
    else merged.delete('keyword');
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
      title={`${SOURCE_LABEL[source]} 병원`}
      description="원본 미러를 healthcare_hospital 과 무관하게 그대로 조회합니다."
      breadcrumbs={[
        { label: '연동 데이터' },
        { label: SOURCE_LABEL[source], to: `/${source}/dashboard` },
        { label: '병원' },
      ]}
    >
      <div className="max-w-6xl">
        <form
          onSubmit={handleSearch}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              병원명 · {ID_LABEL[source]}
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <TextField
                placeholder={`병원명 또는 ${ID_LABEL[source]}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-72 pl-9"
              />
            </span>
          </label>
          <Button type="submit" variant="outline" className="w-auto shrink-0">
            <Search className="h-4 w-4" />
            검색
          </Button>
        </form>

        {query.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
            {errorMessage(query.error, '목록을 불러오지 못했습니다.')}
          </div>
        ) : query.isLoading ? (
          <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
            조건에 맞는 병원이 없습니다.
          </div>
        ) : (
          <>
            <Table columns={COLUMNS} head={['병원명', ID_LABEL[source], '지역', '연락처', '동기화', '']}>
              {data.items.map((row) => (
                <Link
                  key={row.id}
                  to={`/${source}/hospitals/${encodeURIComponent(row.id)}`}
                  className={cn(
                    'grid items-center border-b border-gray-100 py-3.5 transition last:border-0 hover:bg-gray-50',
                    COLUMNS,
                  )}
                >
                  <span className="truncate font-medium text-gray-900">
                    {row.name ?? <span className="text-gray-400">이름 없음</span>}
                  </span>
                  <span className="truncate font-mono text-xs text-gray-400">{row.id}</span>
                  <span className="truncate text-sm text-gray-500">
                    {[row.sidoNm, row.sgguNm].filter(Boolean).join(' ') || '—'}
                  </span>
                  <span className="truncate text-sm text-gray-500">{row.tel ?? '—'}</span>
                  <SyncedAt iso={row.syncedAt} />
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
      </div>
    </AdminLayout>
  );
}

function SyncedAt({ iso }: { iso: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span className="text-sm text-gray-400">—</span>;
  return <span className="text-sm text-gray-500">{date.toISOString().slice(0, 10)}</span>;
}
