import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pause, Play } from "lucide-react";

import {
  getBatchOverview,
  listBatchStages,
  setBatchJobEnabled,
  setBatchStageEnabled,
  type BatchJobStatus,
  type BatchStage,
} from "@/shared/api/batch";
import { errorMessage } from "@/shared/api/errorMessage";
import { AdminLayout } from "@/shared/components/AdminLayout";
import { cn } from "@/shared/lib/cn";
import { formatDateTime } from "@/shared/lib/formatDateTime";
import { Badge } from "@/shared/ui/Badge";
import { formatCount } from "../batchUi";
import { BatchTabs } from "../components/BatchTabs";

/**
 * 배치 켜고 끄기. **잡·단계 두 층위를 여기서 다 다룬다** — 보는 것(현황)과 고치는 것(설정)을
 * 가르는 원칙을 잡 스케줄에도 그대로 적용한다(BatchTabs 참고). 현황 탭은 이제 읽기 전용이다.
 *
 * **왜 잡 말고 단계도 따로 있나.** 원본(data.go.kr)의 일일 호출 한도는 서비스키 단위인데
 * 개발서버와 운영이 같은 키를 쓴다. dev 가 개별 상세를 훑으면 그만큼이 그대로 운영 몫에서
 * 빠진다. 그렇다고 잡(hira)을 통째로 끄면 싸고 중요한 목록 단계(hira.1)까지 멈춘다 —
 * 목록은 전체 병원과 코드표를 받는 자리라 이게 멈추면 나머지가 다 낡는다.
 *
 * 그래서 잡은 통째로, 단계는 개별 상세만 골라 끄는 두 켜기/끄기가 따로 있다.
 */
export default function BatchStages() {
  const jobs = useQuery({
    // 현황(BatchJobs) 과 같은 키를 쓴다 — 여기서 켜고 끄면 탭을 넘어가도 다시 안 읽어도 된다.
    queryKey: ["batch-jobs"],
    queryFn: getBatchOverview,
  });
  const stages = useQuery({
    queryKey: ["batch-stages"],
    queryFn: () => listBatchStages(),
  });

  const stagesByJob = groupByJob(stages.data ?? []);

  return (
    <AdminLayout
      breadcrumbs={[{ label: "배치", to: "/batch" }, { label: "설정" }]}
      title="배치 설정"
      description="잡을 켜고 끕니다. 개별 상세 단계가 있는 잡(hira·nmc·mois)은 그 밑에 펼쳐집니다."
    >
      <BatchTabs current="settings" />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>개발서버와 운영이 같은 서비스키를 씁니다.</strong> 일일 호출
            한도는 키 단위라, 여기서 켜 둔 개별 상세 단계가 쓰는 콜만큼 운영
            몫이 줄어듭니다. 개발서버에서는 개별 상세 단계를 꺼 두는 것을
            권합니다 — 목록 단계(<code>*.1</code>)는 싸고 다른 적재의 기준이라
            켜 두어야 합니다.
          </span>
        </p>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          잡 스케줄
        </h2>

        {jobs.isPending && (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        )}
        {jobs.isError && (
          <p className="text-sm text-red-600">{errorMessage(jobs.error)}</p>
        )}
        {stages.isError && (
          <p className="text-sm text-red-600">
            개별 상세 단계를 불러오지 못했습니다 — {errorMessage(stages.error)}
          </p>
        )}
        {jobs.data && (
          <div className="space-y-3">
            {jobs.data.jobs.map((job) => (
              <JobRow
                key={job.job}
                job={job}
                stages={stagesByJob.get(job.job)}
              />
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

function JobRow({
  job,
  stages,
}: {
  job: BatchJobStatus;
  stages?: BatchStage[];
}) {
  const client = useQueryClient();

  const toggle = useMutation({
    mutationFn: () => setBatchJobEnabled(job.job, !job.enabled),
    // 서버가 정본이다. 낙관적 갱신을 하지 않고 목록을 다시 읽는다 —
    // 껐다고 화면에 떠 있는데 실제로는 안 꺼진 것이 제일 나쁘다.
    onSettled: () => client.invalidateQueries({ queryKey: ["batch-jobs"] }),
  });

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        // 끈 잡은 눈에 덜 띄게. 고장이 아니라 의도한 상태라 경보 색을 쓰지 않는다.
        job.enabled ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-mono text-sm font-semibold",
                job.enabled ? "text-gray-900" : "text-gray-400",
              )}
            >
              {job.job}
            </span>
            {!job.enabled && <Badge tone="red">스케줄 중지</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">{job.description}</p>
          <p className="mt-1 text-xs text-gray-400">
            마지막 성공 {formatDateTime(job.lastSuccessAt)}
            {job.lastCalls > 0 &&
              ` · 마지막 실행 ${formatCount(job.lastCalls)}콜`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          title={
            job.enabled
              ? "스케줄을 끕니다. 수동 실행은 계속 가능합니다."
              : "스케줄을 다시 켭니다."
          }
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
            "disabled:opacity-50",
            job.enabled
              ? "border-gray-300 text-gray-600 hover:bg-gray-50"
              : "border-blue-300 text-blue-600 hover:bg-blue-50",
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
      </div>

      {/* 개별 상세 단계. hira·nmc·mois 처럼 단계로 쪼개진 잡만 여기가 붙는다. */}
      {stages && stages.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pl-4 pt-3">
          {stages.map((stage) => (
            <StageRow key={stage.job} stage={stage} />
          ))}
        </div>
      )}
    </div>
  );
}

function StageRow({ stage }: { stage: BatchStage }) {
  const client = useQueryClient();

  const toggle = useMutation({
    mutationFn: () => setBatchStageEnabled(stage.job, !stage.enabled),
    // 서버가 정본이다. 낙관적 갱신을 하지 않고 목록을 다시 읽는다 —
    // 껐다고 화면에 떠 있는데 실제로는 안 꺼진 것이 제일 나쁘다.
    onSettled: () => client.invalidateQueries({ queryKey: ["batch-stages"] }),
  });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
        // 끈 단계는 눈에 덜 띄게. 고장이 아니라 의도한 상태라 경보 색을 쓰지 않는다.
        // 부모 잡 카드 안에 얹히는 줄이라 배경은 옅게(gray-50/white 대신 white/gray-50) 유지한다.
        stage.enabled
          ? "border-gray-100 bg-gray-50/60"
          : "border-gray-100 bg-gray-100",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-xs font-semibold",
              stage.enabled ? "text-gray-800" : "text-gray-400",
            )}
          >
            {stage.job}
          </span>
          {!stage.enabled && <Badge tone="red">중지</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{stage.description}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          마지막 성공 {formatDateTime(stage.lastSuccessAt)}
          {stage.calls > 0 && ` · 마지막 실행 ${formatCount(stage.calls)}콜`}
        </p>
      </div>

      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        title={
          stage.enabled
            ? "이 단계를 끕니다. 스케줄과 수동 실행(hanscli) 모두 막힙니다."
            : "이 단계를 다시 켭니다."
        }
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
          "disabled:opacity-50",
          stage.enabled
            ? "border-gray-300 text-gray-600 hover:bg-gray-50"
            : "border-blue-300 text-blue-600 hover:bg-blue-50",
        )}
      >
        {stage.enabled ? (
          <>
            <Pause className="h-3 w-3" />
            중지
          </>
        ) : (
          <>
            <Play className="h-3 w-3" />
            재개
          </>
        )}
      </button>
    </div>
  );
}

/** 단계의 provider 는 그 단계를 담은 잡 이름과 같다(hira·nmc·mois). 그 잡 카드 밑에 붙인다. */
function groupByJob(stages: BatchStage[]): Map<string, BatchStage[]> {
  const groups = new Map<string, BatchStage[]>();
  for (const stage of stages) {
    const rows = groups.get(stage.provider);
    if (rows) {
      rows.push(stage);
    } else {
      groups.set(stage.provider, [stage]);
    }
  }
  return groups;
}
