import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pause, Play, Zap } from "lucide-react";

import {
  getBatchOverview,
  listBatchStages,
  runBatchJob,
  runBatchStage,
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
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
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
      description="잡을 켜고 끄거나 지금 한 번 돌립니다. 개별 상세 단계가 있는 잡(hira·nmc·mois)은 그 밑에 펼쳐집니다."
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
            <br />
            <strong>끄는 것은 스케줄과 hanscli 를 막습니다.</strong> 이 화면의 실행
            버튼은 꺼 두었어도 돕니다 — 지목해서 누른 것이라 의도가 분명하기
            때문입니다.
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
  const [asking, setAsking] = useState(false);
  const [force, setForce] = useState(false);
  const running = job.status === "RUNNING";
  // 잡을 통째로 돌리면 꺼 둔 단계까지 돈다. 누르기 전에 몇 개인지 보여준다.
  const disabledStages = stages?.filter((stage) => !stage.enabled).length ?? 0;

  const toggle = useMutation({
    mutationFn: () => setBatchJobEnabled(job.job, !job.enabled),
    // 서버가 정본이다. 낙관적 갱신을 하지 않고 목록을 다시 읽는다 —
    // 껐다고 화면에 떠 있는데 실제로는 안 꺼진 것이 제일 나쁘다.
    onSettled: () => client.invalidateQueries({ queryKey: ["batch-jobs"] }),
  });

  /*
    지금 실행. **성공해도 끝난 것이 아니다** — 배치가 받아들였다는 응답이라 여기서는
    창만 닫고, 진행과 결과는 현황 탭이 보여준다.

    실패하면 창을 열어 둔다. 닫아 버리면 "이미 돌고 있다"·"배치가 안 떠 있다" 같은
    사유가 화면에서 사라져, 누른 사람은 눌렸는지조차 모른다.
  */
  const run = useMutation({
    mutationFn: () => runBatchJob(job.job, force),
    onSuccess: () => {
      closeDialog();
      void client.invalidateQueries({ queryKey: ["batch-jobs"] });
    },
  });

  function closeDialog() {
    setAsking(false);
    setForce(false);
    run.reset();
  }

  return (
    <>
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

          <div className="flex shrink-0 items-center gap-2">
            {/*
              **스케줄과 따로 둔다.** 저 버튼은 "앞으로 돌지 마라" 를 바꾸는 것이고
              이건 지금 한 번 돌리는 것이라, 껐든 켰든 눌릴 수 있어야 한다.
            */}
            <button
              type="button"
              onClick={() => setAsking(true)}
              disabled={running}
              title={
                running
                  ? "이미 돌고 있습니다."
                  : "크론 시각을 기다리지 않고 지금 한 번 돌립니다. 스케줄을 꺼 두었어도 됩니다."
              }
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                "border-blue-300 text-blue-600 hover:bg-blue-50",
                "disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent",
              )}
            >
              <Zap className="h-3 w-3" />
              {running ? "실행 중" : "지금 실행"}
            </button>

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
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
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

      {asking && (
        <ConfirmDialog
          title={`${job.job} 을 지금 돌릴까요?`}
          confirmLabel="지금 실행"
          loading={run.isPending}
          onConfirm={() => run.mutate()}
          onClose={closeDialog}
        >
          <p>{job.description}</p>
          <p className="mt-2">
            크론 시각을 기다리지 않고 한 번 돌립니다. 끝날 때까지 기다리지 않고
            창이 닫히며, 진행 상황과 결과는 현황 탭에서 봅니다.
          </p>

          {/*
            **꺼 둔 단계도 돈다는 것을 여기서 알린다.** 단계 off 의 목적이 원본 한도
            보호인데, 잡 전체를 돌리면 그 보호를 지나친다 — 막지는 않되 누르기 전에
            보이게 한다. 단계 하나만 돌리려면 아래 줄의 실행 버튼을 쓰면 된다.
          */}
          {disabledStages > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <strong>꺼 둔 단계 {disabledStages}개도 함께 돕니다.</strong> 잡 전체를
              돌리는 것이라 그렇습니다. 한 단계만 확인하려면 그 단계 줄의 실행 버튼을
              쓰세요.
            </p>
          )}

          <label className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold text-gray-700">
                이미 받은 것도 다시 받기
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                최근에 성공한 단계도 돌고, 이미 받아 둔 병원도 다시 조회합니다.{" "}
                <strong>원본 호출을 크게 씁니다</strong> — 원본이 바뀌어 다시 받아야
                할 때만 켜세요.
              </span>
            </span>
          </label>

          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            개발서버와 운영이 같은 서비스키를 씁니다. 여기서 쓰는 호출만큼 원본의
            그날 몫이 줄어듭니다.
          </p>

          {run.isError && (
            <p className="mt-3 text-sm text-red-600">
              {errorMessage(run.error, "실행을 요청하지 못했습니다.")}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function StageRow({ stage }: { stage: BatchStage }) {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [force, setForce] = useState(false);
  const running = stage.status === "RUNNING";

  const toggle = useMutation({
    mutationFn: () => setBatchStageEnabled(stage.job, !stage.enabled),
    // 서버가 정본이다. 낙관적 갱신을 하지 않고 목록을 다시 읽는다 —
    // 껐다고 화면에 떠 있는데 실제로는 안 꺼진 것이 제일 나쁘다.
    onSettled: () => client.invalidateQueries({ queryKey: ["batch-stages"] }),
  });

  /*
    단계 하나만 실행. **회차에 안 붙는다** — 잡 카드가 아니라 현황 탭의 "수동 실행" 영역에
    뜬다. 그래서 두 목록을 다 다시 읽는다.
  */
  const run = useMutation({
    mutationFn: () => runBatchStage(stage.job, force),
    onSuccess: () => {
      closeDialog();
      void client.invalidateQueries({ queryKey: ["batch-stages"] });
      void client.invalidateQueries({ queryKey: ["batch-jobs"] });
    },
  });

  function closeDialog() {
    setAsking(false);
    setForce(false);
    run.reset();
  }

  return (
    <>
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

        <div className="flex shrink-0 items-center gap-2">
          {/* 이 단계만 돌린다. **꺼져 있어도 눌린다** — 지목해서 누른 것이라 의도가 분명하다. */}
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={running}
            title={
              running
                ? "이미 돌고 있습니다."
                : "이 단계만 지금 돌립니다. 꺼 두었어도 돕니다."
            }
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
              "border-blue-300 text-blue-600 hover:bg-blue-50",
              "disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent",
            )}
          >
            <Zap className="h-3 w-3" />
            {running ? "실행 중" : "실행"}
          </button>

          <button
            type="button"
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
            title={
              stage.enabled
                ? "이 단계를 끕니다. 스케줄과 hanscli 가 막힙니다(관리자 화면의 실행은 그대로 됩니다)."
                : "이 단계를 다시 켭니다."
            }
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
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
      </div>

      {asking && (
        <ConfirmDialog
          title={`${stage.job} 단계를 지금 돌릴까요?`}
          confirmLabel="지금 실행"
          loading={run.isPending}
          onConfirm={() => run.mutate()}
          onClose={closeDialog}
        >
          <p>{stage.description}</p>
          <p className="mt-2">
            <strong>이 단계 하나만</strong> 돕니다. 잡 전체가 아니라서 나머지 단계는
            건드리지 않습니다.
            {!stage.enabled && " 꺼 두었지만 지목해 누른 것이므로 돕니다."}
          </p>

          <label className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold text-gray-700">
                이미 받은 것도 다시 받기
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                최근에 성공한 단계도 돌고, 이미 받아 둔 병원도 다시 조회합니다.{" "}
                <strong>원본 호출을 크게 씁니다</strong> — 원본이 바뀌어 다시 받아야
                할 때만 켜세요.
              </span>
            </span>
          </label>

          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            개발서버와 운영이 같은 서비스키를 씁니다. 여기서 쓰는 호출만큼 원본의 그날
            몫이 줄어듭니다.
          </p>

          {run.isError && (
            <p className="mt-3 text-sm text-red-600">
              {errorMessage(run.error, "실행을 요청하지 못했습니다.")}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
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
