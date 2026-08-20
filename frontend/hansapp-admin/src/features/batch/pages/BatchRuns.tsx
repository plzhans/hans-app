import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  getBatchRun,
  listBatchRuns,
  type BatchJobRun,
  type BatchStageRun,
} from '@/shared/api/batch';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { Pagination } from '@/shared/ui/Pagination';
import { Table } from '@/shared/ui/Table';
import {
  ProgressBar,
  SourceBadge,
  StatusBadge,
  formatCount,
  formatDuration,
} from '../batchUi';

const PAGE_SIZE = 30;

const COLUMNS =
  'grid-cols-[minmax(0,1fr)_110px_90px_110px_100px_110px] gap-4 px-6';

const STAGE_COLUMNS =
  'grid-cols-[130px_100px_minmax(0,1fr)_100px_90px_90px] gap-4 px-6';

/**
 * 회차 이력.
 *
 * **한 줄이 한 회차다.** 펼치면 그 회차에 돈 단계들이 나온다 — 어느 단계가 오래
 * 걸렸는지, 무엇이 생략됐는지, 어디서 실패했는지가 거기 있다.
 *
 * `건너뜀` 인 회차는 **크론은 떴지만 이전 회차가 안 끝나 그냥 돌아간** 것이다.
 * 행이 아예 없는 것(프로세스가 죽어 안 뜸)과는 다른 상태라 일부러 남긴다.
 */
export default function BatchRuns() {
  const [params, setParams] = useSearchParams();
  const jobs = params.get('jobs') ?? '';
  const page = Number(params.get('page') ?? '1');

  const query = useQuery({
    queryKey: ['batch-runs', jobs, page],
    queryFn: () =>
      listBatchRuns({
        page,
        size: PAGE_SIZE,
        jobs: jobs ? jobs.split(',').filter(Boolean) : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const data = query.data;

  const goPage = (next: number) => {
    const updated = new URLSearchParams(params);
    updated.set('page', String(next));
    setParams(updated);
  };

  return (
    <AdminLayout
      title="실행 이력"
      description="배치 잡이 언제 돌았고 무엇을 했는지 봅니다. 줄을 누르면 단계별로 펼쳐집니다."
      breadcrumbs={[{ label: '배치', to: '/batch' }, { label: '실행 이력' }]}
    >
      {jobs && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-gray-400">잡</span>
          <span className="font-mono font-semibold text-gray-700">{jobs}</span>
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams())}
            className="text-gray-400 hover:underline"
          >
            전체 보기
          </button>
        </div>
      )}

      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '실행 이력을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          아직 실행 기록이 없습니다.
        </div>
      ) : (
        <>
          <Table
            columns={COLUMNS}
            head={['시작', '잡', '결과', '소요', '처리', 'API 콜']}
            minWidth="min-w-[900px]"
          >
            {data.items.map((run) => (
              <RunRow key={run.id} run={run} />
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

function RunRow({ run }: { run: BatchJobRun }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={cn(
          'grid w-full cursor-pointer items-center py-3.5 text-left transition hover:bg-gray-50',
          open && 'bg-gray-50',
          COLUMNS,
        )}
      >
        <span className="flex items-center gap-2 text-sm text-gray-700">
          {formatDateTime(run.startedAt)}
          <SourceBadge source={run.source} />
          {/*
            예정보다 1분 넘게 늦은 회차만 알린다. 초 단위 차이는 늘 있는 것이라
            표시하면 모든 줄에 붙어 의미가 없어진다.
          */}
          {run.delayMs != null && run.delayMs > 60000 && (
            <span className="text-xs text-amber-600">
              +{formatDuration(run.delayMs)} 지연
            </span>
          )}
        </span>
        <span className="truncate text-xs text-gray-500">{run.job}</span>
        <span>
          <StatusBadge status={run.status} />
        </span>
        <span className="text-xs text-gray-500">
          {formatDuration(run.elapsedMs)}
        </span>
        <span className="text-xs text-gray-500">{formatCount(run.processed)}</span>
        <span className="text-xs text-gray-500">{formatCount(run.calls)}</span>
      </button>

      {open && <RunDetail run={run} />}
    </div>
  );
}

/** 펼친 회차의 속. 열 때 처음 부른다 — 목록 30줄의 단계를 미리 받을 이유가 없다. */
function RunDetail({ run }: { run: BatchJobRun }) {
  const query = useQuery({
    queryKey: ['batch-run', run.id],
    queryFn: () => getBatchRun(run.id),
  });

  if (query.isLoading) {
    return <div className="px-6 py-4 text-xs text-gray-400">불러오는 중…</div>;
  }
  if (query.isError) {
    return (
      <div className="px-6 py-4 text-xs text-red-600">
        {errorMessage(query.error, '회차를 불러오지 못했습니다.')}
      </div>
    );
  }

  const stages = query.data?.stages ?? [];

  return (
    <div className="space-y-3 bg-gray-50 px-6 pb-5 pt-1">
      {run.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {run.error}
        </p>
      )}

      {/* 이 회차를 어디서 돌렸나. 옛 빌드가 섞여 있으면 판(version)에서 드러난다. */}
      {run.hostname && (
        <p className="text-xs text-gray-400">
          <span className="font-mono text-gray-500">{run.hostname}</span>
          {run.pid != null && <span className="font-mono"> pid={run.pid}</span>}
          {run.version && <span className="ml-1.5 font-mono">{run.version}</span>}
        </p>
      )}

      {stages.length === 0 ? (
        <p className="text-xs text-gray-400">
          {/*
            정리 잡(auth-cleanup)은 단계 구조가 없다. 적재 회차인데 비어 있다면
            시작하자마자 죽은 것이다.
          */}
          단계 기록이 없습니다. 단계가 없는 잡이거나, 시작 직후 멈춘 회차입니다.
        </p>
      ) : (
        <Table
          columns={STAGE_COLUMNS}
          head={['단계', '결과', '내용', '소요', '처리', 'API 콜']}
          minWidth="min-w-[820px]"
        >
          {stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </Table>
      )}

      {/* 잡마다 모양이 다른 요약. 열로 못 뽑는 것만 여기 담긴다. */}
      {run.summary != null && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
            원본 요약
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 text-[11px] leading-relaxed text-gray-600">
            {JSON.stringify(run.summary, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function StageRow({ stage }: { stage: BatchStageRun }) {
  return (
    <div className={cn('grid items-center py-3 text-xs', STAGE_COLUMNS)}>
      <span className="font-mono font-semibold text-gray-700">
        {stage.job}
        {stage.detail && <span className="text-gray-400">.{stage.detail}</span>}
      </span>
      <span>
        <StatusBadge status={stage.status} />
      </span>
      <span className="truncate text-gray-500">
        {stage.status === 'SKIPPED' ? (
          stage.skipReason
        ) : stage.error ? (
          <span className="text-red-600">{stage.error}</span>
        ) : stage.status === 'RUNNING' ? (
          <ProgressBar
            percent={stage.percent}
            processed={stage.processed}
            total={stage.total}
            startedAt={stage.startedAt}
          />
        ) : (
          '-'
        )}
      </span>
      <span className="text-gray-500">{formatDuration(stage.elapsedMs)}</span>
      <span className="text-gray-500">{formatCount(stage.processed)}</span>
      <span className="text-gray-500">{formatCount(stage.calls)}</span>
    </div>
  );
}
