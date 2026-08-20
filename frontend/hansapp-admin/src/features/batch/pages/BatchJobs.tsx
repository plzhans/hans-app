import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Pause, Play } from 'lucide-react';

import {
  getBatchOverview,
  setBatchJobEnabled,
  type BatchJobStatus,
  type RunningStage,
} from '@/shared/api/batch';
import { errorMessage } from '@/shared/api/errorMessage';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/formatDateTime';
import { Badge } from '@/shared/ui/Badge';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  ProgressBar,
  SourceBadge,
  StalledBadge,
  StatusBadge,
  formatCount,
  formatDuration,
} from '../batchUi';

/**
 * 돌고 있을 때만 자주 새로 읽는다.
 *
 * **가만히 있는 화면을 3초마다 두드릴 이유가 없다.** 배치는 하루 두 번 도는 것이라
 * 대부분의 시간에는 아무 변화가 없다. 진행 중일 때만 짧게 잡는다.
 */
const POLL_RUNNING_MS = 3000;
const POLL_IDLE_MS = 60000;

/**
 * 배치 현황.
 *
 * **세 가지를 한 화면에서 답한다.** 무슨 잡이 있나(분류로 묶어서) · 지금 돌고 있나
 * (진행률까지) · 마지막에 어땠나.
 *
 * 여기서 제일 중요한 것은 **`overdue` 경고**다. 예정 시각이 지났는데 갱신되지 않았다는
 * 뜻이고, 그건 배치 프로세스가 죽었다는 신호다 — 실패는 실패로 기록이라도 남지만
 * 죽은 프로세스는 아무것도 안 남기므로 이 값 말고는 알아챌 방법이 없다.
 */
export default function BatchJobs() {
  const query = useQuery({
    queryKey: ['batch-jobs'],
    queryFn: getBatchOverview,
    /*
      **회차 밖 실행이 있을 때도 빨리 돈다.** 잡이 전부 IDLE 이어도 hanscli 로 돌아가는
      단계가 있으면 그 진행률을 봐야 하므로, 둘 중 하나라도 돌면 3초로 잡는다.
    */
    refetchInterval: (q) => {
      const data = q.state.data;
      // 굳은 실행(stalledStages)은 변하지 않으니 빨리 돌 이유가 없다.
      const busy =
        data?.jobs.some((job) => job.status === 'RUNNING') ||
        (data?.manualStages.length ?? 0) > 0;
      return busy ? POLL_RUNNING_MS : POLL_IDLE_MS;
    },
  });

  const jobs = query.data?.jobs;
  const manualStages = query.data?.manualStages ?? [];
  const stalledStages = query.data?.stalledStages ?? [];
  const overdue = jobs?.filter((job) => job.overdue) ?? [];

  return (
    <AdminLayout
      title="배치"
      description="정해진 시각에 도는 작업들입니다. 지금 진행 상황과 마지막 결과를 봅니다."
      breadcrumbs={[{ label: '배치' }]}
    >
      {query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {errorMessage(query.error, '배치 현황을 불러오지 못했습니다.')}
        </div>
      ) : query.isLoading ? (
        <div className="py-24 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : !jobs || jobs.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-sm text-gray-400">
          등록된 잡이 없습니다. 배치가 한 번도 뜨지 않았을 수 있습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {/*
            **맨 위에 따로 세운다.** 표 안의 빨간 줄 하나로는 지나치기 쉽다 —
            이건 "배치가 안 돌고 있다" 는 뜻이라 다른 무엇보다 먼저 보여야 한다.
          */}
          {overdue.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="text-sm text-red-700">
                <p className="font-semibold">
                  예정 시각이 지났는데 돌지 않은 잡이 있습니다
                </p>
                <p className="mt-1 text-xs text-red-600">
                  {overdue.map((job) => job.job).join(', ')} — 배치 프로세스가 떠
                  있는지 확인하세요. 다음 실행 시각은 회차가 끝날 때마다 다시
                  쓰이므로, 지나간 채로 멈춰 있다는 것은 그 갱신이 일어나지 않았다는
                  뜻입니다.
                </p>
              </div>
            </div>
          )}

          {groupByCategory(jobs).map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-2 px-1 text-xs font-semibold text-gray-400">
                {CATEGORY_LABEL[category] ?? category}
              </h2>
              <div className="space-y-3">
                {items.map((job) => (
                  <JobCard key={job.job} job={job} />
                ))}
              </div>
            </section>
          ))}

          {/*
            **스케줄과 섞지 않는다.** 잡 회차에 안 붙은 단계라 잡 카드에 얹으면 배치가
            도는 것처럼 보인다. 그렇다고 안 보여주면 몇 시간짜리를 손으로 돌리는 동안
            콘솔이 깜깜하다 — 침묵이 정상처럼 보이는 게 제일 나쁘다.
          */}
          {manualStages.length > 0 && <ManualStages stages={manualStages} />}

          {/* 돌고 있는 일이 아니라 봐야 하는 이상이다. 그래서 자리도 성격도 따로 둔다. */}
          {stalledStages.length > 0 && <StalledStages stages={stalledStages} />}
        </div>
      )}
    </AdminLayout>
  );
}

/**
 * 분류로 묶는다. 정해 둔 순서를 먼저 내고, 모르는 분류는 뒤에 이름 순으로 붙인다 —
 * 새 분류가 생겨도 화면이 그것을 통째로 빠뜨리지 않는다.
 */
function groupByCategory(jobs: BatchJobStatus[]): [string, BatchJobStatus[]][] {
  const groups = new Map<string, BatchJobStatus[]>();
  for (const job of jobs) {
    const list = groups.get(job.category);
    if (list) {
      list.push(job);
    } else {
      groups.set(job.category, [job]);
    }
  }

  const known = CATEGORY_ORDER.filter((category) => groups.has(category));
  const unknown = [...groups.keys()]
    .filter((category) => !CATEGORY_ORDER.includes(category as never))
    .sort();

  return [...known, ...unknown].map((category) => [
    category,
    groups.get(category) ?? [],
  ]);
}

/** 사람이 직접 돌리고 있는 단계. 스케줄이 아니라 사람이 시작한 것이다. */
function ManualStages({ stages }: { stages: RunningStage[] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold text-gray-400">수동 실행</h2>
      <div className="rounded-2xl border border-blue-200 bg-white p-5">
        <p className="mb-3 text-xs text-gray-500">
          스케줄이 아니라 사람이 직접 돌리고 있는 단계입니다. 어느 잡 회차에도 속하지
          않습니다.
        </p>
        <div className="space-y-2.5">
          {stages.map((stage) => (
            <StageLine key={stage.job} stage={stage} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 중단됐거나 기록이 어긋난 단계.
 *
 * **수동 실행과 자리를 나눈다.** 저쪽은 "지금 돌고 있는 일" 이고 여기는 "봐야 하는 이상" 이다 —
 * 한 곳에 섞으면 죽은 실행이 정상적인 작업처럼 보인다.
 */
function StalledStages({ stages }: { stages: RunningStage[] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold text-gray-400">중단된 실행</h2>
      <div className="rounded-2xl border border-red-200 bg-white p-5">
        <p className="mb-3 text-xs text-gray-500">
          실행 중으로 기록됐지만 살아 있지 않은 것으로 보이는 단계입니다. 프로세스가 끊기면
          종료 기록이 남지 않아 이렇게 굳습니다. 그 잡이 다음에 돌면 저절로 정리됩니다.
        </p>
        <div className="space-y-2.5">
          {stages.map((stage) => (
            <StageLine key={stage.job} stage={stage} stalled />
          ))}
        </div>
      </div>
    </section>
  );
}

/** 두 영역이 같은 줄 모양을 쓴다. */
function StageLine({ stage, stalled }: { stage: RunningStage; stalled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold text-gray-900">{stage.job}</span>
        <SourceBadge source={stage.source} />
        {stalled && <StalledBadge />}
        <span className="text-xs text-gray-400">
          {formatDateTime(stage.startedAt)} 시작
        </span>
        {stage.staleReason && (
          <span className="text-xs text-red-600">{stage.staleReason}</span>
        )}
      </span>
      <ProgressBar
        percent={stage.percent}
        processed={stage.processed}
        total={stage.total}
        startedAt={stage.startedAt}
        staleReason={stage.staleReason}
      />
    </div>
  );
}

function JobCard({ job }: { job: BatchJobStatus }) {
  const running = job.status === 'RUNNING';
  const client = useQueryClient();

  const toggle = useMutation({
    mutationFn: () => setBatchJobEnabled(job.job, !job.enabled),
    // 서버가 정본이다. 낙관적 갱신을 하지 않고 목록을 다시 읽는다 —
    // 껐다고 화면에 떠 있는데 실제로는 안 꺼진 것이 제일 나쁘다.
    onSettled: () => client.invalidateQueries({ queryKey: ['batch-jobs'] }),
  });

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-5',
        job.overdue ? 'border-red-200' : 'border-gray-200',
        // 끈 잡은 눈에 덜 띄게. 고장이 아니라 의도한 상태라 경보 색을 쓰지 않는다.
        !job.enabled && 'bg-gray-50',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-semibold',
                job.enabled ? 'text-gray-900' : 'text-gray-400',
              )}
            >
              {job.job}
            </span>
            {job.enabled ? (
              <StatusBadge status={job.status} />
            ) : (
              <Badge tone="gray">스케줄 중지</Badge>
            )}
            {/* 연속 실패는 한 번 실패와 무게가 다르다. 이어지고 있다는 사실 자체가 신호다. */}
            {job.failureStreak > 1 && (
              <span className="text-xs font-semibold text-red-600">
                {job.failureStreak}회 연속 실패
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{job.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
            title={
              job.enabled
                ? '스케줄을 끕니다. 수동 실행은 계속 가능합니다.'
                : '스케줄을 다시 켭니다.'
            }
            className={cn(
              'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
              'disabled:opacity-50',
              job.enabled
                ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                : 'border-blue-300 text-blue-600 hover:bg-blue-50',
            )}
          >
            {job.enabled ? (
              <>
                <Pause className="h-3 w-3" />
                중지
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                시작
              </>
            )}
          </button>

          <Link
            to={`/batch/runs?jobs=${encodeURIComponent(job.job)}`}
            className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:underline"
          >
            실행 이력
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 진행 중인 단계들. 안 돌고 있으면 이 영역이 통째로 없다. */}
      {running && job.runningStages.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl bg-blue-50/60 p-3">
          {job.runningStages.map((stage) => (
            <div
              key={stage.job}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-xs font-semibold text-blue-900">
                {stage.job}
              </span>
              <ProgressBar
                percent={stage.percent}
                processed={stage.processed}
                total={stage.total}
                startedAt={stage.startedAt}
                staleReason={stage.staleReason}
              />
            </div>
          ))}
        </div>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Field label="주기">
          <span className="font-mono">{job.cronExpression}</span>
          <span className="ml-1.5 text-gray-400">{job.timeZone}</span>
        </Field>
        <Field label="마지막 성공">{formatDateTime(job.lastSuccessAt)}</Field>
        <Field label="마지막 소요">
          {job.lastElapsedMs > 0 ? formatDuration(job.lastElapsedMs) : '-'}
          {job.lastCalls > 0 && (
            <span className="ml-1.5 text-gray-400">
              {formatCount(job.lastCalls)}콜
            </span>
          )}
        </Field>
        <Field label="다음 실행" tone={job.overdue ? 'red' : undefined}>
          {/* 끈 잡에 시각을 띄우면 돌 것처럼 읽힌다. */}
          {job.enabled ? (
            <>
              {formatDateTime(job.nextRunAt)}
              {job.overdue && <span className="ml-1.5 font-semibold">지남</span>}
            </>
          ) : (
            <span className="text-gray-400">중지됨 (수동 실행은 가능)</span>
          )}
        </Field>
      </dl>

      {/* 어디서 도는 잡인가. 유령 프로세스를 찾을 때 이 줄이 결정적이다. */}
      {job.lastHostname && (
        <p className="mt-3 text-xs text-gray-400">
          마지막 실행 위치 <span className="font-mono text-gray-500">{job.lastHostname}</span>
          {job.lastVersion && (
            <span className="ml-1.5 font-mono text-gray-400">({job.lastVersion})</span>
          )}
        </p>
      )}

      {job.lastError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {job.lastError}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'red';
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-gray-400">{label}</dt>
      <dd className={cn('mt-0.5', tone === 'red' ? 'text-red-600' : 'text-gray-700')}>
        {children}
      </dd>
    </div>
  );
}
