import { Inject, Injectable, Logger } from '@nestjs/common';
import { asNumber, asString } from '@hansapp/application';
import { KrDataQuotaError } from '@krdata/core';
import type { HiraClient } from '@krdata/hira';

import { HiraDetailSyncRepository } from './hira-detail-sync.repository';
import { mapWithConcurrency } from '../common/pool';
import { ProgressReporter, SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';

const CONCURRENCY = 8;
const BATCH_SIZE = 50;

/**
 * 개별 조회 기본 세트 10종. `--op` 를 주지 않으면 이게 돈다.
 *
 * NMC 는 basic 한 콜이면 병원 하나가 끝나지만 HIRA 는 10번 두드려야 끝난다.
 * 그래서 실행 단위가 오퍼레이션이 아니라 **병원**이다. 한 병원을 잡으면 10종을 다 받는다.
 * 오퍼레이션별로 훑으면 어느 병원도 완성되지 않은 채 콜만 소모된다.
 *
 * **목록 API 로 같은 것을 얻을 수 있으면 여기 두지 않는다.** specialty 가 그래서 빠졌다
 * (HIRA_EXTRA_OPS 참고). 반대로 subject 는 남아 있다 — 1단계 역조회가 매핑을 이미
 * 만들지만, 개별 조회만 주는 과목별 전문의수(sdr_cnt)가 있어서다. 목록형이 있다고
 * 무조건 빼는 게 아니라, **개별 조회가 더 주는 게 있는지**가 기준이다.
 */
export const HIRA_DETAIL_OPS = [
  'info',
  'facility',
  'equipment',
  'special',
  'nursing',
  'food',
  'subject',
  'specialist',
  'etc-staff',
  'transport',
] as const;

/**
 * 기본 세트에 끼지 않는 opt-in 오퍼레이션.
 *
 * specialty 는 **HiraSpecialtySyncService(1단계)가 19콜에 전수로 받는다.** 병원마다 부르면
 * 병원급만 4,231콜이고 의원급엔 지정 자체가 없어 전부 헛콜이다. 기본 세트에서 뺐지만
 * 역조회 결과를 개별 조회와 대조해볼 때가 있어 `--op specialty` 로는 남겨둔다.
 * special(특수진료)과 헷갈리지 마라 — 그건 다른 것이고 여전히 기본 세트다.
 *
 * **top5 는 여기 있었지만 뺐다 — 원본을 신뢰할 수 없다.** 의원 상위질병5가 표시과목과
 * 전혀 맞지 않는다(소아과에 자궁근종·뇌종양, 서로 다른 의원이 같은 세트). 실측 근거는
 * clients/README.md 의 HIRA 절에 있다. 적재는 원래도 안 돌렸지만 `--op top5` 로 부를 수는
 * 있었다. 쓸 수 없는 값에 의원 37,789콜을 태울 길을 아예 막는다.
 *
 * 스펙·클라이언트(getClinicTop5)·조회 라우트는 남겨뒀다. 원본이 정상화되면 여기에
 * 'top5' 를 되돌리고 fetchOp 에 case 를 넣으면 된다 — 그 둘이 전부다.
 */
export const HIRA_EXTRA_OPS = ['specialty'] as const;

/** --op 검증·타입용 전체 집합. 기본 세트 + opt-in. */
export const HIRA_ALL_OPS = [...HIRA_DETAIL_OPS, ...HIRA_EXTRA_OPS] as const;

export type HiraDetailOp = (typeof HIRA_ALL_OPS)[number];

export interface DetailSyncOptions {
  /** 대상 종별코드. 생략하면 종별을 가리지 않는다 */
  clCd?: string;

  /** 종별코드 제외 목록. 12단계(보건기관 등 나머지)에서 쓴다 */
  excludeClCds?: readonly string[];

  /** 받을 오퍼레이션. 생략하면 기본 세트(HIRA_DETAIL_OPS) 전부 */
  ops?: readonly HiraDetailOp[];

  /** 이번 실행에서 쓸 최대 콜 수 */
  limit?: number;

  /** 이미 받은 것도 다시 받는다 */
  force?: boolean;

  /**
   * 진행분을 알리는 통로. 청크가 끝날 때마다 부른다.
   *
   * 이 단계는 몇 시간을 도는데, 닫힐 때만 기록하면 그동안 화면에 아무 숫자도 안 뜬다.
   * 생략하면 아무 데도 안 알린다(hanscli 로 부를 때).
   */
  report?: ProgressReporter;
}

@Injectable()
export class HiraDetailSyncService {
  private readonly logger = new Logger(HiraDetailSyncService.name);

  constructor(
    private readonly repo: HiraDetailSyncRepository,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(options: DetailSyncOptions = {}): Promise<SyncOutcome> {
    const ops = options.ops ?? HIRA_DETAIL_OPS;
    const total = await this.countTargets(options);

    /**
     * 아직 한도가 남은 오퍼레이션.
     *
     * **한도는 API 별이다**(HIRA 는 오퍼레이션당 10,000/일). equipment 가 한도에 걸려도
     * info 는 아직 살아 있다. 하나 걸렸다고 전체를 멈추면 남은 API 의 할당량을 그냥 버린다.
     * 그래서 걸린 오퍼레이션만 빼고 나머지로 계속 받는다.
     *
     * 그 병원은 미완성으로 남지만 상관없다. hira_hospital_detail 이 (병원, 오퍼레이션) 단위라
     * 다음 실행에서 **못 받은 오퍼레이션만** 이어받는다.
     */
    const alive = new Set<HiraDetailOp>(ops);

    let calls = 0;
    let processed = 0;
    let limitReached = false;

    for (;;) {
      if (alive.size === 0) {
        limitReached = true;
        this.logger.warn('Every HIRA operation hit the daily quota. Resuming tomorrow.');
        break;
      }

      const activeOps = ops.filter((op) => alive.has(op));
      const budget = options.limit === undefined ? Infinity : options.limit - calls;

      // 병원 하나를 진행하려면 살아있는 오퍼레이션 수만큼 콜이 필요하다.
      if (budget < activeOps.length) {
        limitReached = total > processed;
        if (limitReached) {
          this.logger.log(`Reached the call limit (${options.limit}). Resuming on the next run.`);
        }
        break;
      }

      const take = Math.min(BATCH_SIZE, Math.floor(budget / activeOps.length));
      const targets = await this.nextTargets(options, activeOps, take);
      if (targets.length === 0) {
        // 살아있는 오퍼레이션 기준으로는 더 받을 병원이 없다.
        // 한도에 걸린 오퍼레이션이 있다면 그것들은 아직 미완성이다.
        limitReached = alive.size < ops.length;
        break;
      }

      const before = alive.size;

      // **워커 안에서 `calls += await ...` 로 누적하지 마라.** `+=` 는 await 전에 좌변을
      // 읽으므로, 워커 8개가 모두 같은 값을 읽고 각자 덮어써 증가분이 유실된다.
      // (--limit 5 로 돌렸을 때 카운터는 5, 실제 콜은 15였다. 최대 동시성 배까지 어긋난다.)
      // --limit 은 일 10,000 한도를 지키는 유일한 가드라 어긋나면 한도를 넘겨 버린다.
      // 워커는 자기 콜 수만 반환하고, 합산은 모두 끝난 뒤 여기서 한 번에 한다.
      const callsPerHospital = await mapWithConcurrency(targets, CONCURRENCY, (ykiho) =>
        this.fetchHospital(ykiho, activeOps, options.force === true, alive),
      );
      calls += callsPerHospital.reduce((sum, n) => sum + n, 0);

      processed += targets.length;

      if (alive.size < before) {
        this.logger.warn(
          `Daily quota exceeded. Remaining operations: ${[...alive].join(', ') || 'none'}`,
        );
      }

      this.logger.log(
        `HIRA details ${processed.toLocaleString()}/${total.toLocaleString()} hospitals (${calls.toLocaleString()} calls)`,
      );

      // 같은 값을 DB 로도 보낸다. 로그로만 나가면 화면에서는 진행이 안 보인다.
      await options.report?.({ processed, calls, total });
    }

    return { total, processed, calls, limitReached };
  }

  /**
   * 작업 큐. **요청한 오퍼레이션을 다 받지 못한 병원**을 꺼낸다.
   *
   * hira_hospital_detail 에 행이 없으면 아직 안 받은 것이다. 오퍼레이션 수만큼 행이 차면 완성이다.
   * 커서를 따로 두지 않으므로 중단하고 다시 돌리면 미완성 병원부터 이어간다.
   */
  private nextTargets(
    options: DetailSyncOptions,
    ops: readonly HiraDetailOp[],
    take: number,
  ): Promise<string[]> {
    if (take <= 0) {
      return Promise.resolve([]);
    }

    return this.repo.pickTargets(
      options.clCd,
      options.excludeClCds,
      ops,
      options.force === true,
      take,
    );
  }

  private countTargets(options: DetailSyncOptions): Promise<number> {
    return this.repo.countTargets(options.clCd, options.excludeClCds);
  }

  /**
   * 한 병원의 오퍼레이션들을 받는다. 실제로 쓴 콜 수를 돌려준다.
   *
   * 한도에 걸린 오퍼레이션은 `alive` 에서 빼고 **나머지는 계속 받는다.** 한도가 API 별이라
   * 하나가 막혔다고 다른 API 의 할당량까지 버릴 이유가 없다.
   * 한도 외의 오류는 그대로 던진다 — 그건 진짜 장애다.
   */
  private async fetchHospital(
    ykiho: string,
    ops: readonly HiraDetailOp[],
    force: boolean,
    alive: Set<HiraDetailOp>,
  ): Promise<number> {
    let calls = 0;

    for (const op of ops) {
      // 다른 워커가 이 오퍼레이션의 한도 초과를 이미 만났을 수 있다.
      if (!alive.has(op)) {
        continue;
      }
      if (!force && (await this.repo.hasDetail(ykiho, op))) {
        continue;
      }

      let items: Record<string, unknown>[];
      try {
        items = await this.call(op, ykiho);
        calls += 1;

        // --debug 로만 보인다. 병원 하나에 11줄이 찍힌다.
        this.logger.debug(`${ykiho.slice(0, 10)}… ${op.padEnd(10)} ${items.length} rows`);
      } catch (error) {
        if (error instanceof KrDataQuotaError) {
          alive.delete(op);
          this.logger.warn(
            `HIRA ${op} hit the daily quota (${error.errorCode}). Stopping this operation only.`,
          );
          continue;
        }
        throw error;
      }

      await this.repo.storeDetail(ykiho, op, items);

      // 검색 축은 정규화 테이블에도 넣는다. 원본은 hira_hospital_detail 에 그대로 남는다.
      if (op === 'equipment') {
        await this.storeEquipment(ykiho, items);
      } else if (op === 'special' || op === 'specialty') {
        await this.storeSrch(ykiho, op, items);
      } else if (op === 'subject') {
        await this.storeSubjects(ykiho, items);
      }
    }

    return calls;
  }

  /** 오퍼레이션 하나 호출. 응답 item 을 배열로 정규화해 돌려준다. */
  private async call(op: HiraDetailOp, ykiho: string): Promise<Record<string, unknown>[]> {
    const response = await this.dispatch(op, ykiho);
    const body = (
      response as {
        response?: { body?: { items?: { item?: unknown } } };
      }
    ).response?.body;

    const item = body?.items?.item;
    if (Array.isArray(item)) {
      return item as Record<string, unknown>[];
    }
    if (item && typeof item === 'object') {
      return [item as Record<string, unknown>];
    }
    return [];
  }

  private dispatch(op: HiraDetailOp, ykiho: string): Promise<unknown> {
    switch (op) {
      case 'info':
        return this.client.getDetailInfo(ykiho);
      case 'facility':
        return this.client.getFacilityInfo(ykiho);
      case 'equipment':
        return this.client.getEquipmentInfo(ykiho);
      case 'special':
        return this.client.getSpecialDiagnosisInfo(ykiho);
      case 'specialty':
        return this.client.getSpecialtyHospitalFields(ykiho);
      case 'nursing':
        return this.client.getNursingGradeInfo(ykiho);
      case 'food':
        return this.client.getFoodAddcInfo(ykiho);
      case 'subject':
        return this.client.getSubjectInfo(ykiho);
      case 'specialist':
        return this.client.getSpecialistCounts(ykiho);
      case 'etc-staff':
        return this.client.getEtcStaffInfo(ykiho);
      case 'transport':
        return this.client.getTransportInfo(ykiho);
    }
  }

  private async storeEquipment(ykiho: string, items: Record<string, unknown>[]): Promise<void> {
    const rows = items
      .map((item) => ({
        cd: asString(item.oftCd),
        nm: asString(item.oftCdNm),
        cnt: asNumber(item.oftCnt),
      }))
      .filter((row): row is { cd: string; nm: string | null; cnt: number | null } =>
        Boolean(row.cd),
      );

    if (rows.length === 0) {
      return;
    }

    await this.repo.upsertEquipment(ykiho, rows);
  }

  private async storeSrch(
    ykiho: string,
    tp: 'special' | 'specialty',
    items: Record<string, unknown>[],
  ): Promise<void> {
    const rows = items
      .map((item) => ({
        cd: asString(item.srchCd),
        nm: asString(item.srchCdNm),
      }))
      .filter((row): row is { cd: string; nm: string | null } => Boolean(row.cd));

    if (rows.length === 0) {
      return;
    }

    await this.repo.upsertSrch(ykiho, tp, rows);
  }

  /**
   * 진료과목 매핑을 갱신한다. 매핑 자체는 1단계 역조회로 이미 있고,
   * 여기서 추가되는 것은 **과목별 전문의수(dgsbjtPrSdrCnt)** 뿐이다.
   */
  private async storeSubjects(ykiho: string, items: Record<string, unknown>[]): Promise<void> {
    const rows = items
      .map((item) => ({
        cd: asString(item.dgsbjtCd),
        nm: asString(item.dgsbjtCdNm),
        sdr: asNumber(item.dgsbjtPrSdrCnt),
        cdiag: asNumber(item.cdiagDrCnt),
      }))
      .filter((row) => Boolean(row.cd));

    if (rows.length === 0) {
      return;
    }

    await this.repo.upsertSubjects(ykiho, rows);
  }
}
