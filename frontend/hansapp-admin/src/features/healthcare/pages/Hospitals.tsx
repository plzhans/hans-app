import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { listHospitals, type HospitalEngine } from '@/shared/api/hospitals';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Pagination } from '@/shared/ui/Pagination';
import { SelectField } from '@/shared/ui/SelectField';
import { Table } from '@/shared/ui/Table';
import { TextField } from '@/shared/ui/TextField';

const PAGE_SIZE = 20;

const ENGINE_OPTIONS: { value: HospitalEngine; label: string; hint: string }[] = [
  { value: 'db', label: 'DB', hint: '전체 상태 · 최소조건' },
  { value: 'es', label: '검색색인(ES)', hint: '활성만 · 상세조건' },
];

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'active', label: 'active' },
  { value: 'closed', label: 'closed' },
];

/** 쉼표로 구분한 코드 입력을 배열로. 빈 값은 undefined(쿼리에서 빠진다). */
function splitCodes(value: string): string[] | undefined {
  const codes = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return codes.length ? codes : undefined;
}

/** 목록 열 폭. 헤더와 각 행이 같은 값을 써야 세로줄이 맞는다. */
const COLUMNS = 'grid-cols-[64px_minmax(0,1fr)_90px_90px_100px_90px_130px] gap-4 px-6';

/**
 * healthcare_hospital 관리자 목록.
 *
 * **engine 이 필터 가능 범위를 가른다.** db(기본)는 keyword·status·classCd·regionCd 만 —
 * 대신 전체 상태(비활성 포함)를 본다. es 는 진료과목·장비 등 상세 코드로 좁힐 수 있지만
 * 검색색인엔 활성 병원만 있다. 서버가 engine 과 안 맞는 필터 조합을 400 으로 막는다.
 */
export default function Hospitals() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const engine = (params.get('engine') as HospitalEngine) || 'db';
  const keyword = params.get('keyword') ?? '';
  const status = params.get('status') ?? '';
  const classCd = params.get('classCd') ?? '';
  const regionCd = params.get('regionCd') ?? '';
  const tier = params.get('tier') ?? '';
  const emergency = params.get('emergency') === 'true';
  const baby = params.get('baby') === 'true';
  const subjectCds = params.get('subjectCds') ?? '';
  const equipmentCds = params.get('equipmentCds') ?? '';

  // 입력 중인 값은 URL 과 분리한다 — 글자마다 URL 이 바뀌면 뒤로가기가 못 쓰게 된다.
  const [draft, setDraft] = useState({
    keyword,
    classCd,
    regionCd,
    tier,
    subjectCds,
    equipmentCds,
  });

  const query = useQuery({
    queryKey: ['hospitals', { page, engine, ...draft, status, emergency, baby }],
    queryFn: () =>
      listHospitals({
        engine,
        page,
        size: PAGE_SIZE,
        keyword: draft.keyword || undefined,
        status: status || undefined,
        classCd: draft.classCd || undefined,
        regionCd: draft.regionCd || undefined,
        tier: engine === 'es' ? draft.tier || undefined : undefined,
        emergency: engine === 'es' ? emergency : undefined,
        baby: engine === 'es' ? baby : undefined,
        subjectCds: engine === 'es' ? splitCodes(draft.subjectCds) : undefined,
        equipmentCds: engine === 'es' ? splitCodes(draft.equipmentCds) : undefined,
      }),
    // 페이지를 넘길 때 표가 빈 화면으로 깜빡이지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  });

  /** 조건을 바꾼다. **페이지는 1로 되돌린다.** */
  const applyFilter = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    merged.delete('page');
    setParams(merged);
  };

  const changeEngine = (next: HospitalEngine) => {
    // es 는 활성만 색인돼 있다 — db 전용 상태값을 들고 넘어가면 바로 400 을 받는다.
    applyFilter({ engine: next, status: next === 'es' && status !== 'active' ? undefined : status });
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
      title="병원"
      description="healthcare_hospital 을 조회합니다. DB(전체 상태)와 검색색인(상세조건) 중 골라 봅니다."
      breadcrumbs={[{ label: '헬스케어' }, { label: '병원' }]}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {ENGINE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.hint}
              onClick={() => changeEngine(opt.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition',
                engine === opt.value
                  ? 'bg-primary-50 font-semibold text-primary-700'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilter({
              keyword: draft.keyword,
              classCd: draft.classCd,
              regionCd: draft.regionCd,
              tier: engine === 'es' ? draft.tier : undefined,
              subjectCds: engine === 'es' ? draft.subjectCds : undefined,
              equipmentCds: engine === 'es' ? draft.equipmentCds : undefined,
            });
          }}
        >
          <TextField
            placeholder="병원명 · 법인명 · 요양기호 · 기관ID"
            value={draft.keyword}
            onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
            className="w-72"
          />
          <TextField
            placeholder="종별코드"
            value={draft.classCd}
            onChange={(e) => setDraft((d) => ({ ...d, classCd: e.target.value }))}
            className="w-28"
          />
          <TextField
            placeholder="지역코드"
            value={draft.regionCd}
            onChange={(e) => setDraft((d) => ({ ...d, regionCd: e.target.value }))}
            className="w-28"
          />
          <Button type="submit" variant="outline" className="w-auto shrink-0">
            <Search className="h-4 w-4" />
            검색
          </Button>
        </form>

        {engine === 'db' ? (
          <SelectField
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => applyFilter({ status: e.target.value })}
            className="w-32"
          />
        ) : (
          <span className="text-xs text-gray-400">검색색인은 활성 병원만 담습니다.</span>
        )}
      </div>

      {engine === 'es' && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3">
          <TextField
            label="등급코드"
            value={draft.tier}
            onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value }))}
            className="w-32"
          />
          <TextField
            label="진료과목코드(쉼표로 여러 개)"
            value={draft.subjectCds}
            onChange={(e) => setDraft((d) => ({ ...d, subjectCds: e.target.value }))}
            className="w-56"
          />
          <TextField
            label="보유장비코드(쉼표로 여러 개)"
            value={draft.equipmentCds}
            onChange={(e) => setDraft((d) => ({ ...d, equipmentCds: e.target.value }))}
            className="w-56"
          />
          <label className="flex items-center gap-1.5 pb-2.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => applyFilter({ emergency: e.target.checked ? 'true' : undefined })}
            />
            응급실
          </label>
          <label className="flex items-center gap-1.5 pb-2.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={baby}
              onChange={(e) => applyFilter({ baby: e.target.checked ? 'true' : undefined })}
            />
            달빛어린이병원
          </label>
          <Button
            type="button"
            variant="outline"
            className="mb-0.5 w-auto shrink-0"
            onClick={() =>
              applyFilter({ tier: draft.tier, subjectCds: draft.subjectCds, equipmentCds: draft.equipmentCds })
            }
          >
            적용
          </Button>
        </div>
      )}

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '병원 목록을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          조건에 맞는 병원이 없습니다.
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['id', '병원명', '상태', '종별', '지역코드', '등급', '연락처']}
          >
            {data.items.map((hospital) => (
              <div
                key={hospital.id}
                className={cn('grid items-center border-b border-gray-100 py-3.5 last:border-0', COLUMNS)}
              >
                <span className="font-mono text-sm text-gray-400">{hospital.id}</span>
                <span className="truncate">
                  <span className="font-medium text-gray-900">{hospital.name}</span>
                  {hospital.legalName !== hospital.name && (
                    <span className="ml-1.5 truncate text-xs text-gray-400">
                      {hospital.legalName}
                    </span>
                  )}
                </span>
                <span>
                  <Badge tone={hospital.status === 'active' ? 'green' : 'gray'}>
                    {hospital.status}
                  </Badge>
                </span>
                <span className="text-sm text-gray-500">{hospital.classCd ?? '—'}</span>
                <span className="text-sm text-gray-500">{hospital.regionCd ?? '—'}</span>
                <span className="text-sm text-gray-500">{hospital.tier ?? '—'}</span>
                <span className="truncate text-sm text-gray-500">{hospital.tel ?? '—'}</span>
              </div>
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
