import { Injectable, Logger } from '@nestjs/common';

import { SyncStateRepository } from './sync-state.repository';
import { DataProvider } from './provider';

/** 한 번의 실행 단위. CLI 커맨드 하나에 대응한다. */
export interface SyncJob {
  provider: DataProvider;

  /** 계획 문서(krdata-cache-plan.md)의 단계 번호 */
  stage: number;

  /** 같은 단계 안의 세부 구분. 등급이나 오퍼레이션 (예: 'A', 'equipment') */
  detail?: string;
}

/** 실행 결과 집계 */
export interface SyncOutcome {
  total: number;
  processed: number;
  calls: number;

  /**
   * 콜 예산이 모자라 남은 작업을 못 하고 멈춘 경우.
   *
   * 이것을 성공과 구분하지 않으면 "예산이 2콜 남았는데 병원 하나에 11콜이 필요해서
   * 아무것도 못 한" 단계가 콜 0의 성공으로 기록된다. 그러면 뒤 단계들도 줄줄이 헛돌고,
   * 배치는 예산이 없다는 사실을 모른 채 12단계까지 훑는다.
   */
  limitReached?: boolean;
}

/**
 * 이 시간이 지나도록 running 인 단계는 죽은 것으로 본다.
 * 프로세스가 강제 종료되면 status 를 되돌릴 기회가 없어 잠금이 영구히 남기 때문이다.
 */
const STALE_LOCK_HOURS = 6;

/** job 식별자. 예: nmc.1 / nmc.2.A / hira.4.equipment */
export function jobKey(job: SyncJob): string {
  return [job.provider, job.stage, job.detail].filter(Boolean).join('.');
}

/**
 * 배치 단계의 실행 상태를 관리한다.
 *
 * 왜 필요한가: 8만 콜짜리 단계는 한 번에 못 끝난다(개발계정 일 1,000건). 중단·재개가 전제이고,
 * 그러려면 "무엇을 언제 성공했나"가 남아야 한다. 모니터링과 중복 실행 방지도 여기서 나온다.
 *
 * 병원 단위의 이어받기는 이 테이블이 아니라 각 병원 행의 `*_synced_at` 이 담당한다.
 * (NULL 인 병원이 곧 작업 큐다. 커서를 따로 두지 않는다)
 */
@Injectable()
export class SyncStateService {
  private readonly logger = new Logger(SyncStateService.name);

  constructor(private readonly repo: SyncStateRepository) {}

  /**
   * 마지막 성공이 maxAgeHours 이내면 true — 즉 아직 신선하니 다시 돌 필요가 없다.
   *
   * 신선도 기준은 단계마다 다르다. 목록 벌크는 8만 건을 통째로 다시 받으므로 주 1회면 충분하고,
   * 개별 상세는 못 받은 병원을 이어받는 것이라 매일 돌아야 한다. 그래서 판정을 시간으로 받는다.
   *
   * 배치가 매일 같은 크론으로 전 단계를 훑어도, 목록 단계는 여기서 스스로 건너뛴다.
   * --force 면 호출부가 이 판정을 무시한다.
   */
  async isFresh(job: SyncJob, maxAgeHours: number): Promise<boolean> {
    const state = await this.repo.find(jobKey(job));
    if (!state?.lastSuccessAt) {
      return false;
    }

    /**
     * **마지막 실행이 done 이어야 신선하다.** 시각만 보면 안 된다.
     *
     * last_success_at 은 성공할 때만 갱신되고 실패해도 지워지지 않는다. 그래서
     * "예전에 성공 → 오늘 실패" 인 단계를 시각만으로 판정하면 **실패한 단계를 건너뛴다.**
     * 실제로 9단계가 그랬다 — 어제 429(한도)로 죽었는데, 그 전의 빈 실행이 남긴
     * last_success_at 때문에 하루 종일 "최근에 성공했다"며 한 콜도 안 나갔다.
     *
     *   partial  남은 작업이 있는 채로 멈췄다 → 바로 이어받는다
     *   failed   실패했다 → 다시 시도한다 (원인이 한도였다면 원본이 다시 거절할 뿐이다)
     *   running  isRunning 이 따로 잡는다
     */
    if (state.status !== 'done') {
      return false;
    }

    const ageMs = Date.now() - state.lastSuccessAt.getTime();
    return ageMs < maxAgeHours * 60 * 60 * 1000;
  }

  /**
   * 이미 다른 실행이 돌고 있으면 true. 배치와 CLI 가 같은 단계를 겹쳐 돌리지 않게 한다.
   *
   * **죽은 잠금은 무시한다.** 프로세스가 강제 종료되면(OOM·SIGKILL·컨테이너 재시작)
   * status 가 running 인 채로 영원히 남는다. 그러면 그 단계는 다시는 안 돈다.
   * 그래서 시작한 지 오래된 running 은 죽은 것으로 보고 넘어간다.
   *
   * 임계값은 가장 오래 걸리는 단계보다 넉넉해야 한다. 실측상 가장 긴 것이 HIRA 의원급
   * (하루치 10,000곳 × 11종)이라 몇 시간 단위다. 6시간이면 충분하다.
   */
  async isRunning(job: SyncJob): Promise<boolean> {
    const state = await this.repo.find(jobKey(job));
    if (state?.status !== 'running') {
      return false;
    }

    const startedAt = state.startedAt?.getTime();
    if (startedAt === undefined) {
      return false;
    }

    const ageMs = Date.now() - startedAt;
    if (ageMs > STALE_LOCK_HOURS * 60 * 60 * 1000) {
      this.logger.warn(
        `${jobKey(job)} 가 ${Math.round(ageMs / 3_600_000)}시간째 running 이다. 죽은 잠금으로 보고 다시 실행한다.`,
      );
      return false;
    }

    return true;
  }

  /** 실행 시작을 기록한다. */
  async start(job: SyncJob): Promise<void> {
    await this.repo.start(jobKey(job), job.provider, job.stage);
  }

  /**
   * 성공을 기록한다.
   *
   * 한도(또는 콜 상한)에 걸려 **남은 작업이 있는 채로 멈췄으면 done 이 아니라 partial** 이다.
   * done 으로 찍으면 신선도 규칙(24시간)에 걸려 그날은 더 못 돈다. 1,000곳만 받고 끝난 단계가
   * 완료된 것처럼 굳어버린다.
   *
   * partial 은 "성공했지만 아직 남았다"는 뜻이라, 다음 실행에서 신선도를 무시하고 이어받는다.
   */
  async succeed(job: SyncJob, outcome: SyncOutcome, elapsedMs: number): Promise<void> {
    const now = new Date();
    await this.repo.update(jobKey(job), {
      status: outcome.limitReached ? 'partial' : 'done',
      finishedAt: now,
      lastSuccessAt: now,
      total: outcome.total,
      processed: outcome.processed,
      calls: outcome.calls,
      elapsedMs,
      error: null,
    });
  }

  /**
   * 실패를 기록한다. last_success_at 은 건드리지 않는다.
   * 실패해도 이미 받은 병원(*_synced_at)은 남으므로, 다시 돌리면 못 받은 것부터 이어간다.
   */
  async fail(job: SyncJob, error: unknown, elapsedMs: number): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${jobKey(job)} 실패: ${message}`);

    await this.repo.update(jobKey(job), {
      status: 'failed',
      finishedAt: new Date(),
      elapsedMs,
      error: message,
    });
  }

  /** 전체 상태 조회 (CLI `sync status`) */
  async list(provider?: DataProvider) {
    return this.repo.list(provider);
  }

  /**
   * 실행을 감싼다. 시작·성공·실패 기록을 한곳에서 처리한다.
   * 스킵 판정은 호출부(CLI)가 한다. 여기서 하면 --force 를 이 계층까지 끌고 와야 한다.
   */
  async run(
    job: SyncJob,
    body: () => Promise<SyncOutcome>,
  ): Promise<SyncOutcome & { elapsedMs: number }> {
    const startedAt = Date.now();
    await this.start(job);

    try {
      const outcome = await body();
      const elapsedMs = Date.now() - startedAt;
      await this.succeed(job, outcome, elapsedMs);
      return { ...outcome, elapsedMs };
    } catch (error) {
      await this.fail(job, error, Date.now() - startedAt);
      throw error;
    }
  }
}
