import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BatchJobService,
  HealthcareBuildService,
  HealthcareDetailBuildService,
  HealthcareIndexService,
  HiraNmcMatchService,
  RunAllResult,
  SyncRunnerService,
  type DataProvider,
  type RunContext,
} from '@hansapp/admin-application';
import { BatchRunSource, BatchRunStatus } from '@hansapp/common';
import { SearchSchemaService } from '@hansapp/search';
import { JobLockService, LOCK_NOT_ACQUIRED } from '@hansapp/lock';

import { BATCH_CONFIG, BatchConfig } from './batch.config';
import { AuthCleanupService } from './auth-cleanup.service';
import { SessionCacheSweeper } from './session-cache-sweeper.service';
import type { BatchJobDefinition, BatchJobName } from './batch.jobs';

/** 한 잡이 한 회차에 낸 결과. 회차 이력에 그대로 접힌다. */
interface JobOutcome {
  readonly status: BatchRunStatus;
  readonly calls?: number;
  readonly processed?: number;
  readonly error?: string;
  readonly summary?: unknown;
}

/**
 * 잡 실행의 단일 창구.
 *
 * **적재 로직은 하나도 여기 없다.** admin-application 계층의 서비스를 부르기만 한다.
 * CLI 와 완전히 같은 코드를 부른다 — CLI 는 사람이, 배치는 크론이 부르는 차이뿐이다.
 *
 * 잡마다 하는 일이 다르지만 **시작·종료·겹침 처리는 한 곳에서** 한다. 그러지 않으면
 * 잡이 늘 때마다 기록을 빠뜨린 경로가 하나씩 생긴다.
 */
@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    private readonly runner: SyncRunnerService,
    private readonly match: HiraNmcMatchService,
    private readonly build: HealthcareBuildService,
    private readonly detail: HealthcareDetailBuildService,
    private readonly index: HealthcareIndexService,
    private readonly searchSchema: SearchSchemaService,
    private readonly authCleanup: AuthCleanupService,
    private readonly sessionCacheSweeper: SessionCacheSweeper,
    private readonly jobs: BatchJobService,
    private readonly lock: JobLockService,
    @Inject(BATCH_CONFIG) private readonly config: BatchConfig,
  ) {}

  /**
   * 잡 하나를 돌린다. 크론·`--once` 가 모두 이 문을 지난다.
   *
   * @param source 크론이 부른 것인지 --once 인지. 이력에 그대로 적힌다.
   * @param scheduledAt 원래 돌기로 했던 시각. 지연을 재는 기준이라 크론만 넘긴다.
   * @param nextRunAt 이 회차가 끝난 뒤의 다음 예정 시각. 크론만 안다.
   */
  async run(
    definition: BatchJobDefinition,
    options: {
      source?: BatchRunSource;
      scheduledAt?: Date;
      nextRunAt?: Date;
      force?: boolean;
    } = {},
  ): Promise<void> {
    const { name } = definition;
    const source = options.source ?? BatchRunSource.ONCE;

    /*
      **끈 잡은 크론 시각이 와도 안 돈다.** 관리자가 콘솔에서 끈 것이다.

      부팅 때가 아니라 **실행 시점에 읽는다** — admin-api 와 배치는 다른 프로세스라
      관리자가 누른 값을 배치에 밀어 넣을 길이 없다. tick 마다 한 번 읽으면 재시작 없이
      즉시 반영되고, 하루 몇 번뿐이라 비용도 없다.

      **수동 실행(--job·CLI)은 통과시킨다.** 끈다는 것은 "정해진 시각에 저절로 돌지 마라"
      이지 "이 작업을 봉인하라" 가 아니다 — 껐는데 고친 뒤 확인할 길이 없으면 곤란하다.
    */
    if (source === BatchRunSource.CRON && !(await this.jobs.isEnabled(name))) {
      // 이력에 남기지 않는다. 의도한 중지는 이상이 아니라서, 매 tick 남기면 이력만 더럽힌다.
      this.logger.log(`${name}: schedule is off — skipped`);
      return;
    }

    /*
      **겹침 판정은 락 하나가 전부다.** 예전에는 프로세스 메모리의 Set 으로 막았는데,
      인스턴스가 둘이면 그냥 뚫렸다(상주 배치가 도는 중에 --job 을 하나 더 띄우면 그렇다).
      같은 일을 두 군데서 판정하면 한쪽은 반드시 틀리므로 메모리 쪽은 없앴다.
    */
    const result = await this.lock.withLock(name, () => this.execute(definition, source, options));

    if (result === LOCK_NOT_ACQUIRED) {
      this.logger.warn(`${name}: skipped — could not acquire the lock`);
      /*
        **떴다는 사실은 남긴다.** 이 회차를 통째로 기록하지 않으면, 겹쳐서 돌아간 것과
        프로세스가 죽어 아예 안 뜬 것이 DB 상 똑같이 빈칸이 된다.
      */
      await this.jobs.skip(
        name,
        source,
        'could not acquire the lock — another runner holds it, or redis is unavailable',
        options.scheduledAt,
      );
    }
  }

  /** 락을 잡은 뒤의 본체. 회차를 열고 닫는다. */
  private async execute(
    definition: BatchJobDefinition,
    source: BatchRunSource,
    options: { scheduledAt?: Date; nextRunAt?: Date; force?: boolean },
  ): Promise<void> {
    const { name } = definition;
    const startedAt = Date.now();
    const run = await this.jobs.start(name, source, options.scheduledAt);
    // 단계 이력이 이 회차를 부모로 삼는다. hanscli 로 돈 단계는 이 값이 없어 저절로 갈린다.
    const context: RunContext = { jobRunId: run.historyId, source };

    try {
      this.logger.log(`${name}: started`);
      const outcome = await this.runJob(name, context, options.force === true);

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.logger.log(
        `${name}: done — ${(outcome.calls ?? 0).toLocaleString()} calls / ${seconds}s`,
      );

      await this.jobs.finish(run, { ...outcome, nextRunAt: options.nextRunAt });
    } catch (error) {
      /*
        여기까지 오는 것은 배치 자체의 버그다 — 단계·테이블 실패는 안에서 처리된다.
        그래도 회차는 닫아야 한다. 안 닫으면 마스터가 RUNNING 으로 굳어 다음 회차가
        겹침으로 오해받는다.
      */
      await this.jobs.finish(run, {
        status: BatchRunStatus.FAILED,
        error: describe(error),
        nextRunAt: options.nextRunAt,
      });
      throw error;
    }
  }

  /** 잡 이름 → 실제로 할 일. 새 잡을 넣으면 여기에 가지를 하나 더한다. */
  private runJob(name: BatchJobName, context: RunContext, force: boolean): Promise<JobOutcome> {
    switch (name) {
      case 'mois':
      case 'hira':
      case 'nmc':
        return this.syncProvider(name, context, force);
      case 'healthcare':
        return this.buildHealthcare();
      case 'es-index':
        return this.reindex();
      case 'auth-cleanup':
        return this.cleanupAuth();
    }
  }

  /**
   * 한 기관의 전 단계를 순서대로 돌린다.
   *
   * 단계가 여럿이어도 **크론은 하나면 된다.** "목록은 주 1회, 상세는 매일" 같은 요구는
   * 크론을 나누지 않고 단계별 신선도로 푼다 — 1단계는 신선도가 7일이라 주 6일은
   * 스스로 생략된다(생략은 실패가 아니다. 다음 단계로 그대로 간다).
   */
  private async syncProvider(
    provider: DataProvider,
    context: RunContext,
    force: boolean,
  ): Promise<JobOutcome> {
    // 일일 한도는 원본이 알려준다(resultCode 22). 우리가 세지 않는다.
    // budget 은 사고 방지용 안전판일 뿐이고 보통은 없다.
    const result = await this.runner.runAll(provider, {
      budget: this.config.maxCallsPerRun,
      force,
      context,
    });
    this.report(provider, result);
    return summarizeSync(result);
  }

  /**
   * 통합 병원 데이터를 만든다. **외부 API 를 부르지 않는다** — DB 안의 계산이다.
   *
   * 매칭이 먼저다. 통합 빌드가 hira_nmc_link 를 보고 같은 병원을 하나로 합치므로,
   * 매칭이 낡으면 새로 들어온 병원이 둘로 쪼개진 채 만들어진다.
   */
  private async buildHealthcare(): Promise<JobOutcome> {
    const match = await this.match.match();
    this.logger.log(
      `healthcare: matched — auto ${match.auto.toLocaleString()} / review ${match.review.toLocaleString()}`,
    );

    const built = await this.build.build();
    this.logger.log(
      `healthcare: built — ${built.hospitals.toLocaleString()} hospitals` +
        ` (both ${built.fromBoth.toLocaleString()} · hira ${built.hiraOnly.toLocaleString()}` +
        ` · nmc ${built.nmcOnly.toLocaleString()})` +
        // 매칭이 붙어 두 행에서 한 행으로 접힌 병원. 매일 큰 수가 나오면 매칭이 흔들린다는 뜻이다.
        (built.merged > 0 ? ` · merged ${built.merged.toLocaleString()}` : ''),
    );

    const detail = await this.detail.build();
    this.logger.log(
      `healthcare: details — subjects ${detail.subjects.toLocaleString()} / hours ${detail.hours.toLocaleString()}`,
    );

    return {
      status: BatchRunStatus.DONE,
      // 외부 API 를 안 부르므로 콜은 늘 0 이다.
      calls: 0,
      processed: built.hospitals,
      summary: { match, build: built, detail },
    };
  }

  /**
   * 통합 병원을 검색 색인에 반영한다. **전량이다.**
   *
   * 증분으로 하려면 "무엇이 바뀌었나" 를 알아야 하는데, ES 문서는 헬스케어 표만으로
   * 만들어지지 않는다 — 병원평가(hira_hospital_asm)와 번역(healthcare_hospital_i18n)이
   * 색인 시점에 조인된다. 헬스케어 변경분만 보면 **평가등급이 바뀐 병원을 놓친다.**
   * 실측 64초라, 조건을 유지보수하다 조용히 낡는 것보다 매번 다 미는 편이 낫다.
   *
   * **정리(reconcile)를 항상 켠다.** 합병·폐업으로 DB 에서 사라진 병원이 검색에 계속
   * 뜨는 것을 막는 유일한 장치다 — 실제로 합병 170건이 유령 문서로 남아 있었다.
   */
  private async reindex(): Promise<JobOutcome> {
    // 인덱스가 없으면 스스로 만든다(첫 배포). 만들었을 때만 알린다.
    const created = await this.searchSchema.ensure(this.index.logicalName);
    if (created?.createdIndex) {
      this.logger.log(`es-index: created ${created.createdIndex} (alias ${created.aliasTarget})`);
    }

    const result = await this.index.syncAll();
    // 대사는 upsert 뒤다 — 방금 활성화된 병원까지 반영된 상태로 유지 대상을 잡는다.
    const pruned = await this.index.reconcile();

    this.logger.log(
      `es-index: ${result.indexed.toLocaleString()}/${result.total.toLocaleString()} indexed` +
        `, ${pruned.toLocaleString()} pruned` +
        (result.failed > 0 ? `, ${result.failed} failed` : '') +
        (result.skipped > 0 ? `, ${result.skipped} skipped` : ''),
    );

    /*
      **문서 변환 실패(skipped)는 성공으로 치지 않는다.** 그대로 넘기면 색인이 조용히
      반쪽 난다 — 그 병원들은 검색에 안 나오는데 아무도 모른다.
      색인 거부(failed)도 같다.
    */
    const broken = result.failed + result.skipped;

    return {
      status: broken > 0 ? BatchRunStatus.PARTIAL : BatchRunStatus.DONE,
      calls: 0,
      processed: result.indexed,
      error: broken > 0 ? `${result.failed} failed, ${result.skipped} skipped` : undefined,
      summary: { ...result, pruned },
    };
  }

  /**
   * 인증 부산물을 정리한다.
   *
   * **캐시 정리를 DB 정리에 붙여 둔다.** 고아 캐시는 DB 행이 사라진 세션의 것이라,
   * 만료 행을 치운 직후가 훑기 좋은 시점이다 — 방금 지운 것들도 함께 걸린다.
   *
   * 두 서비스 모두 안에서 실패를 삼키므로 **결과를 받아 회차 상태로 접는다.**
   * 안 그러면 세 테이블이 다 실패한 날도 회차가 DONE 으로 남는다.
   */
  private async cleanupAuth(): Promise<JobOutcome> {
    const cleanup = await this.authCleanup.run();
    const cache = await this.sessionCacheSweeper.run();

    const broken = [
      ...cleanup.failed,
      ...(cache.failedChunks > 0 ? [`sessionCache(${cache.failedChunks} chunks)`] : []),
    ];

    return {
      status: broken.length ? BatchRunStatus.FAILED : BatchRunStatus.DONE,
      calls: 0,
      processed: cleanup.total + cache.removed,
      error: broken.length ? `failed: ${broken.join(', ')}` : undefined,
      summary: { removed: cleanup.removed, sessionCache: cache },
    };
  }

  /** 단계별 결과를 한 줄씩 남긴다. 실패한 단계가 있으면 마지막 줄이 그것이다. */
  private report(label: string, result: RunAllResult): void {
    for (const run of result.runs) {
      if (run.error) {
        this.logger.error(`  ${label} stage ${run.stage} failed: ${run.error}`);
      } else if (run.result?.skipped) {
        this.logger.log(`  ${label} stage ${run.stage} skipped: ${run.result.skipReason}`);
      } else {
        this.logger.log(
          `  ${label} stage ${run.stage}: ${run.result?.calls.toLocaleString()} calls / ${run.result?.processed.toLocaleString()} processed`,
        );
      }
    }

    if (result.budgetExhausted) {
      this.logger.log(
        `  ${label} call budget is used up. Remaining stages resume on the next run.`,
      );
    }
  }
}

/**
 * 단계 결과를 회차 한 줄로 접는다.
 *
 * **한 단계라도 실패했으면 회차는 성공이 아니다.** 단계 실패는 안에서 처리돼 예외로
 * 올라오지 않으므로, 여기서 접지 않으면 전부 실패한 날도 회차가 DONE 으로 남는다.
 *
 * 예산이 남아 못 돈 단계가 있으면 PARTIAL 이다 — 다음 회차가 이어받는다는 뜻이라
 * 실패와 구별해야 한다.
 */
function summarizeSync(result: RunAllResult): JobOutcome {
  const failed = result.runs.filter((run) => run.error);

  return {
    status: failed.length
      ? BatchRunStatus.FAILED
      : result.budgetExhausted
        ? BatchRunStatus.PARTIAL
        : BatchRunStatus.DONE,
    calls: result.calls,
    processed: result.runs.reduce((sum, run) => sum + (run.result?.processed ?? 0), 0),
    // 어느 단계가 왜 죽었는지는 sync_state_history 에 다 있다. 여기는 한 줄 요약만 남긴다.
    error: failed.length
      ? `${failed.length} stage(s) failed: ${failed.map((run) => `${run.provider}.${run.stage}`).join(', ')}`
      : undefined,
    summary: {
      stages: result.runs.map((run) => ({
        job: `${run.provider}.${run.stage}`,
        calls: run.result?.calls ?? 0,
        processed: run.result?.processed ?? 0,
        // 어느 단계가 오래 걸렸나. sync_state_history 에도 있지만, 이 한 줄만 펴 봐도
        // 회차 안의 시간 분포가 보이게 여기에도 담는다.
        elapsedMs: run.result?.elapsedMs ?? 0,
        skipped: run.result?.skipped ?? false,
        error: run.error,
      })),
      budgetExhausted: result.budgetExhausted,
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
