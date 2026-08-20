import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';

/*
  **값이 없는 필드는 응답에서 아예 빠진다.** 서버가 StripNullInterceptor 를 전역으로 걸어
  null 프로퍼티를 지우기 때문이다(스프링의 non_null 과 같은 효과). 그래서 아래 타입들은
  nullable 을 `?: T | null` 로 적는다 — `T | null` 로만 적으면 `=== null` 검사가 통과해
  버린다. 실제로 percent 에서 그 사고가 났다(막대가 꽉 찬 것처럼 보였다).
*/

/** 실행 결과. 서버가 숫자 코드를 이름으로 풀어서 준다. */
export type BatchRunStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'DONE'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED';

/** 어떻게 불렸나. CLI 는 사람이 hanscli 로 돌린 것이다. */
export type BatchRunSource = 'CRON' | 'ONCE' | 'CLI' | 'ADMIN';

/** 잡의 도메인 분류. 목록을 이 기준으로 묶는다. */
export type BatchCategory = 'HEALTHCARE' | 'AUTH' | 'USER';

/** 지금 돌고 있는 단계 한 줄 */
export interface RunningStage {
  job: string;
  provider: string;
  stage: number;
  /** 어떻게 불렸나. 회차 밖 실행은 CRON 이 아니다. */
  source: BatchRunSource | string;
  startedAt: string;
  total: number;
  processed: number;
  calls: number;
  /** 0~100. 대상 건수를 아직 세기 전이면 null. */
  percent?: number | null;
  /**
   * 살아 있지 않은 것으로 보이는 이유. **없으면 정상적으로 도는 중이다.**
   *
   * RUNNING 은 스스로 풀리지 않는다 — 프로세스가 끊기면 종료 기록이 안 돌아
   * 행이 영영 RUNNING 으로 남고, 경과 시간이 하염없이 올라간다.
   */
  staleReason?: string;
}

/** 잡 하나의 현황 */
export interface BatchJobStatus {
  job: string;
  description: string;
  category: BatchCategory | string;
  cronExpression: string;
  timeZone: string;
  /**
   * 스케줄이 살아 있나. **끄면 크론 시각이 와도 안 돈다.**
   *
   * 수동 실행(hanscli·--job)은 껐어도 그대로 된다 — 끈다는 것은 "정해진 시각에 저절로
   * 돌지 마라" 이지 "이 작업을 봉인하라" 가 아니다.
   */
  enabled: boolean;
  status: BatchRunStatus | string;
  lastStartedAt?: string | null;
  lastFinishedAt?: string | null;
  lastSuccessAt?: string | null;
  lastElapsedMs: number;
  lastCalls: number;
  lastProcessed: number;
  lastError?: string | null;
  failureStreak: number;
  /** 마지막으로 이 잡을 돌린 호스트·판. 어디서 도는 잡인지 여기서 본다. */
  lastHostname?: string | null;
  lastVersion?: string | null;
  nextRunAt?: string | null;
  /**
   * 예정 시각이 지났는데 아직 안 돌았다.
   *
   * **스케줄러가 죽었다는 신호다.** 다음 실행 시각은 회차가 끝날 때마다 다시 쓰이므로,
   * 배치가 살아 있으면 항상 미래를 가리킨다.
   */
  overdue: boolean;
  runningStages: RunningStage[];
}

/** 회차 한 줄 */
export interface BatchJobRun {
  /** BigInt 라 서버가 문자열로 준다. */
  id: string;
  job: string;
  source: BatchRunSource | string;
  status: BatchRunStatus | string;
  scheduledAt?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  elapsedMs?: number | null;
  /** 예정보다 늦게 시작한 시간(ms). 수동 실행은 없다. */
  delayMs?: number | null;
  calls: number;
  processed: number;
  error?: string | null;
  summary: unknown;
  /** 이 회차를 돌린 주체. 옛 행은 비어 있다. */
  hostname?: string | null;
  pid?: number | null;
  version?: string | null;
}

/** 단계 한 줄 */
export interface BatchStageRun {
  id: string;
  job: string;
  provider: string;
  stage: number;
  detail?: string | null;
  source: BatchRunSource | string;
  status: BatchRunStatus | string;
  skipReason?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  elapsedMs: number;
  total: number;
  processed: number;
  calls: number;
  percent?: number | null;
  error?: string | null;
}

export interface BatchJobRunDetail {
  run: BatchJobRun;
  stages: BatchStageRun[];
}

export interface BatchRunParams {
  page: number;
  size: number;
  jobs?: string[];
  from?: string;
  to?: string;
}

/** 현황 화면이 한 번에 받는 것 */
export interface BatchOverview {
  jobs: BatchJobStatus[];

  /** 사람이 직접 돌리고 있는 단계. hanscli(CLI)나 관리자 화면(ADMIN)에서 시작한 것. */
  manualStages: RunningStage[];

  /**
   * 중단됐거나 기록이 어긋난 단계. staleReason 에 이유가 담긴다.
   *
   * **수동 실행과 섞지 않는다** — 사람이 시작한 것이 아니고, 저건 "지금 돌고 있는 일",
   * 이건 "봐야 하는 이상" 이라 성격이 반대다.
   */
  stalledStages: RunningStage[];
}

/** 잡 목록과 각각의 현황 + 회차 밖 수동 실행. 진행 중이면 runningStages 가 찬다. */
export function getBatchOverview() {
  return apiFetch<BatchOverview>('/api/batch/jobs');
}

/** 스케줄 켜기/끄기. 재시작 없이 즉시 반영된다. */
export function setBatchJobEnabled(job: string, enabled: boolean) {
  return apiFetch<BatchJobStatus>(`/api/batch/jobs/${encodeURIComponent(job)}/enabled`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

/** 회차 이력. 최근 순. */
export function listBatchRuns(params: BatchRunParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  if (params.jobs?.length) query.set('jobs', params.jobs.join(','));
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return apiFetch<PageResponse<BatchJobRun>>(`/api/batch/runs?${query.toString()}`);
}

/** 회차 하나와 그 안의 단계들. */
export function getBatchRun(id: string) {
  return apiFetch<BatchJobRunDetail>(`/api/batch/runs/${encodeURIComponent(id)}`);
}

/**
 * 한 단계의 이력. **회차를 가리지 않는다** —
 * hanscli 로 사람이 돌린 실행도 함께 나온다(source=CLI).
 */
export function listBatchStageRuns(job: string, page: number, size: number) {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  return apiFetch<PageResponse<BatchStageRun>>(
    `/api/batch/stages/${encodeURIComponent(job)}?${query.toString()}`,
  );
}
