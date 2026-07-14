import { Inject, Injectable, Logger } from '@nestjs/common';
import { asNumber, asString } from '@hansapi/application';
import { PrismaService } from '@hansapi/data';
import { KrDataQuotaError } from '@krdata/core';
import type { HiraClient } from '@krdata/hira';
import { Prisma } from '@prisma/client';

import { mapWithConcurrency } from '../common/pool';
import { SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';

const CONCURRENCY = 8;
const BATCH_SIZE = 50;

/**
 * 개별 조회 11종.
 *
 * NMC 는 basic 한 콜이면 병원 하나가 끝나지만 HIRA 는 11번 두드려야 끝난다.
 * 그래서 실행 단위가 오퍼레이션이 아니라 **병원**이다. 한 병원을 잡으면 11종을 다 받는다.
 * 오퍼레이션별로 훑으면 어느 병원도 완성되지 않은 채 콜만 소모된다.
 */
export const HIRA_DETAIL_OPS = [
  'info',
  'facility',
  'equipment',
  'special',
  'specialty',
  'nursing',
  'food',
  'subject',
  'specialist',
  'etc-staff',
  'transport',
] as const;

export type HiraDetailOp = (typeof HIRA_DETAIL_OPS)[number];

export interface DetailSyncOptions {
  /** 대상 종별코드. 생략하면 종별을 가리지 않는다 */
  clCd?: string;

  /** 종별코드 제외 목록. 12단계(보건기관 등 나머지)에서 쓴다 */
  excludeClCds?: readonly string[];

  /** 받을 오퍼레이션. 생략하면 11종 전부 */
  ops?: readonly HiraDetailOp[];

  /** 이번 실행에서 쓸 최대 콜 수 */
  limit?: number;

  /** 이미 받은 것도 다시 받는다 */
  force?: boolean;
}

@Injectable()
export class HiraDetailSyncService {
  private readonly logger = new Logger(HiraDetailSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
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
        this.logger.warn('HIRA 11종 모두 일일 한도에 걸렸다. 내일 이어받는다.');
        break;
      }

      const activeOps = ops.filter((op) => alive.has(op));
      const budget =
        options.limit === undefined ? Infinity : options.limit - calls;

      // 병원 하나를 진행하려면 살아있는 오퍼레이션 수만큼 콜이 필요하다.
      if (budget < activeOps.length) {
        limitReached = total > processed;
        if (limitReached) {
          this.logger.log(
            `콜 한도(${options.limit})에 도달했다. 다음 실행에서 이어받는다.`,
          );
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

      await mapWithConcurrency(targets, CONCURRENCY, async (ykiho) => {
        calls += await this.fetchHospital(
          ykiho,
          activeOps,
          options.force === true,
          alive,
        );
      });

      processed += targets.length;

      if (alive.size < before) {
        this.logger.warn(
          `일일 한도 초과 — 남은 오퍼레이션: ${[...alive].join(', ') || '없음'}`,
        );
      }

      this.logger.log(
        `HIRA 상세 ${processed.toLocaleString()}/${total.toLocaleString()} 병원 (콜 ${calls.toLocaleString()})`,
      );
    }

    return { total, processed, calls, limitReached };
  }

  /**
   * 작업 큐. **11종을 다 받지 못한 병원**을 꺼낸다.
   *
   * hira_hospital_detail 에 행이 없으면 아직 안 받은 것이다. 오퍼레이션 수만큼 행이 차면 완성이다.
   * 커서를 따로 두지 않으므로 중단하고 다시 돌리면 미완성 병원부터 이어간다.
   */
  private async nextTargets(
    options: DetailSyncOptions,
    ops: readonly HiraDetailOp[],
    take: number,
  ): Promise<string[]> {
    if (take <= 0) {
      return [];
    }

    const scope = this.scope(options);
    const done = options.force
      ? Prisma.sql`1 = 0`
      : Prisma.sql`(
          SELECT COUNT(*) FROM hira_hospital_detail d
           WHERE d.ykiho = h.ykiho AND d.op IN (${Prisma.join(ops.map((op) => Prisma.sql`${op}`))})
        ) >= ${ops.length}`;

    const rows = await this.prisma.$queryRaw<{ ykiho: string }[]>(
      Prisma.sql`
        SELECT h.ykiho FROM hira_hospital h
         WHERE ${scope} AND NOT ${done}
         LIMIT ${take}
      `,
    );
    return rows.map((row) => row.ykiho);
  }

  private async countTargets(options: DetailSyncOptions): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) c FROM hira_hospital h WHERE ${this.scope(options)}`,
    );
    return Number(rows[0]?.c ?? 0);
  }

  /** 등급 조건. cl_cd 는 generated column 이라 JSON 을 열지 않는다. */
  private scope(options: DetailSyncOptions): Prisma.Sql {
    if (options.clCd) {
      return Prisma.sql`h.cl_cd = ${options.clCd}`;
    }
    if (options.excludeClCds?.length) {
      const list = Prisma.join(
        options.excludeClCds.map((cd) => Prisma.sql`${cd}`),
      );
      return Prisma.sql`(h.cl_cd IS NULL OR h.cl_cd NOT IN (${list}))`;
    }
    return Prisma.sql`1 = 1`;
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
      if (!force && (await this.alreadyHave(ykiho, op))) {
        continue;
      }

      let items: Record<string, unknown>[];
      try {
        items = await this.call(op, ykiho);
        calls += 1;

        // --debug 로만 보인다. 병원 하나에 11줄이 찍힌다.
        this.logger.debug(
          `${ykiho.slice(0, 10)}… ${op.padEnd(10)} ${items.length}행`,
        );
      } catch (error) {
        if (error instanceof KrDataQuotaError) {
          alive.delete(op);
          this.logger.warn(
            `HIRA ${op} 일일 한도 초과(${error.errorCode}). 이 오퍼레이션만 중단한다.`,
          );
          continue;
        }
        throw error;
      }

      await this.store(ykiho, op, items);

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

  private async alreadyHave(ykiho: string, op: string): Promise<boolean> {
    const found = await this.prisma.hira_hospital_detail.findUnique({
      where: { ykiho_op: { ykiho, op } },
      select: { op: true },
    });
    return found !== null;
  }

  /** 오퍼레이션 하나 호출. 응답 item 을 배열로 정규화해 돌려준다. */
  private async call(
    op: HiraDetailOp,
    ykiho: string,
  ): Promise<Record<string, unknown>[]> {
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

  /**
   * 원본 응답을 통째로 보관한다. 1행짜리(info, facility)는 객체로, 여러 행은 배열로 넣는다.
   * 결과가 0건이어도 행을 만든다. 안 그러면 매번 다시 조회한다(전문병원이 아닌 병원의 specialty 등).
   */
  private async store(
    ykiho: string,
    op: HiraDetailOp,
    items: Record<string, unknown>[],
  ): Promise<void> {
    const data = items.length === 1 ? items[0] : items;

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO hira_hospital_detail (ykiho, op, data, created_at, updated_at, synced_at)
        VALUES (${ykiho}, ${op}, CAST(${JSON.stringify(data)} AS JSON), NOW(), NOW(), NOW()) AS new
        ON DUPLICATE KEY UPDATE
          updated_at = IF(hira_hospital_detail.data = new.data, hira_hospital_detail.updated_at, NOW()),
          synced_at  = NOW(),
          data       = new.data
      `,
    );
  }

  private async storeEquipment(
    ykiho: string,
    items: Record<string, unknown>[],
  ): Promise<void> {
    const rows = items
      .map((item) => ({
        cd: asString(item.oftCd),
        nm: asString(item.oftCdNm),
        cnt: asNumber(item.oftCnt),
      }))
      .filter(
        (row): row is { cd: string; nm: string | null; cnt: number | null } =>
          Boolean(row.cd),
      );

    if (rows.length === 0) {
      return;
    }

    const values = Prisma.join(
      rows.map(
        (row) =>
          Prisma.sql`(${ykiho}, ${row.cd}, ${row.nm}, ${row.cnt}, NOW())`,
      ),
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO hira_hospital_equipment (ykiho, oft_cd, oft_nm, oft_cnt, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          oft_nm = new.oft_nm, oft_cnt = new.oft_cnt, synced_at = NOW()
      `,
    );
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
      .filter((row): row is { cd: string; nm: string | null } =>
        Boolean(row.cd),
      );

    if (rows.length === 0) {
      return;
    }

    const values = Prisma.join(
      rows.map(
        (row) => Prisma.sql`(${ykiho}, ${tp}, ${row.cd}, ${row.nm}, NOW())`,
      ),
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO hira_hospital_srch (ykiho, tp, srch_cd, srch_nm, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE srch_nm = new.srch_nm, synced_at = NOW()
      `,
    );
  }

  /**
   * 진료과목 매핑을 갱신한다. 매핑 자체는 1단계 역조회로 이미 있고,
   * 여기서 추가되는 것은 **과목별 전문의수(dgsbjtPrSdrCnt)** 뿐이다.
   */
  private async storeSubjects(
    ykiho: string,
    items: Record<string, unknown>[],
  ): Promise<void> {
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

    const values = Prisma.join(
      rows.map(
        (row) =>
          Prisma.sql`(${ykiho}, ${row.cd}, ${row.nm}, ${row.sdr}, ${row.cdiag}, 'subject', NOW())`,
      ),
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO hira_hospital_subject
          (ykiho, dgsbjt_cd, dgsbjt_nm, sdr_cnt, cdiag_cnt, source, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          dgsbjt_nm = new.dgsbjt_nm,
          sdr_cnt   = new.sdr_cnt,
          cdiag_cnt = new.cdiag_cnt,
          source    = 'subject',
          synced_at = NOW()
      `,
    );
  }
}
