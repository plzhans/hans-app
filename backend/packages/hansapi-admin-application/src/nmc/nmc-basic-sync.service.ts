import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapi/application';
import { Prisma, PrismaService } from '@hansapi/data';
import { KrDataQuotaError } from '@krdata/core';
import type { HospitalBasisInfoItem, NmcClient } from '@krdata/nmc';

import { mapWithConcurrency } from '../common/pool';
import { SyncOutcome } from '../common/sync-state.service';
import { NMC_CLIENT } from '../krdata.providers';

/**
 * 동시 호출 수. 30 TPS 제한이 있고 응답이 200~500ms 라 8이면 초당 16~40건이다.
 * 여유를 두고 8로 잡는다. 더 올려도 원본이 못 따라온다.
 */
const CONCURRENCY = 8;

/** 한 번에 가져올 작업 큐 크기 */
const BATCH_SIZE = 200;

/**
 * 규모기관 등급. 이 순서로 받는다. 정보 밀도가 높은 순이다.
 *
 * 실측(등급별 basic 호출):
 *   A 종합병원  응급실 99% · 병상 850 · 응급실병상 22종 · 중증처치 10종 · 과목 25종
 *   B 병원      응급실  9% · 병상 185
 *   E 한방병원  응급실  0% · 병상  50
 *   M 치과병원  응급실  0% · 병상   5
 *   D 요양병원  응급실  0% · 병상 181 — 응급·중증이 없고 과목도 1~4개라 맨 뒤다
 */
export const NMC_MAJOR_DIVS = ['A', 'B', 'E', 'M', 'D'] as const;

export interface BasicSyncOptions {
  /** 대상 기관구분. 생략하면 규모기관 전체를 등급 순서로 */
  divs?: readonly string[];

  /** 의원급(규모기관이 아닌 것 전부)을 대상으로 한다. 3단계용 */
  clinics?: boolean;

  /** 이번 실행에서 쓸 최대 콜 수. 개발계정 일 한도 대응 */
  limit?: number;

  /** 이미 받은 병원도 다시 받는다 */
  force?: boolean;
}

/**
 * NMC 병원별 기본정보(basic)를 받는다. **병원당 1콜**이다.
 *
 * basic 은 한 콜에 68개 필드를 준다 — 진료과목(dgidIdName), 병상수(hpbdn),
 * 응급실 병상 세부(o001~o038), 중증질환 처치가능(MKioskTy*), 입원실·수술실 운영 여부.
 * fulldown 에는 이 중 아무것도 없다.
 *
 * `basic_synced_at IS NULL` 인 병원이 곧 작업 큐다. 커서를 따로 두지 않으므로
 * 중단하고 다시 돌리면 못 받은 것부터 이어간다.
 */
@Injectable()
export class NmcBasicSyncService {
  private readonly logger = new Logger(NmcBasicSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NMC_CLIENT) private readonly client: NmcClient,
  ) {}

  async sync(options: BasicSyncOptions = {}): Promise<SyncOutcome> {
    const total = await this.countTargets(options);
    let calls = 0;
    let processed = 0;
    let limitReached = false;

    for (;;) {
      const remaining =
        options.limit === undefined ? BATCH_SIZE : options.limit - calls;

      // 병원 하나가 1콜이다. 1콜도 못 쓰면 더 진행할 수 없다.
      if (remaining < 1) {
        limitReached = total > processed;
        if (limitReached) {
          this.logger.log(
            `콜 한도(${options.limit})에 도달했다. 다음 실행에서 이어받는다.`,
          );
        }
        break;
      }

      const targets = await this.nextTargets(
        options,
        Math.min(BATCH_SIZE, remaining),
      );
      if (targets.length === 0) {
        break;
      }

      let done = 0;
      try {
        await mapWithConcurrency(targets, CONCURRENCY, async (hpid) => {
          await this.fetchAndStore(hpid);
          done += 1;
        });
      } catch (error) {
        // 한도 초과는 장애가 아니다. 원본이 "오늘은 그만"이라고 한 것이다.
        // 우리가 콜을 세지 않는 이유가 이것이다 — 세면 반드시 어긋난다(실패한 콜이 잡히는지,
        // 다른 프로세스가 같은 키를 쓰는지 알 수 없다). 원본이 아는 사실은 원본에게 묻는다.
        if (error instanceof KrDataQuotaError) {
          calls += done;
          processed += done;
          this.logger.warn(
            `NMC 일일 호출 한도 초과(${error.errorCode}). ${processed.toLocaleString()}건까지 받았다. 내일 이어받는다.`,
          );
          return { total, processed, calls, limitReached: true };
        }
        throw error;
      }

      calls += targets.length;
      processed += targets.length;

      this.logger.log(
        `NMC basic ${processed.toLocaleString()}/${total.toLocaleString()} (콜 ${calls.toLocaleString()})`,
      );
    }

    return { total, processed, calls, limitReached };
  }

  /**
   * 작업 큐. 아직 안 받은 병원을 등급 순서로 꺼낸다.
   *
   * duty_div 는 generated column 이라 JSON 을 열지 않고 인덱스만 읽는다.
   * FIELD() 로 등급 우선순위를 준다 — 종합병원부터, 요양병원은 맨 뒤.
   */
  private async nextTargets(
    options: BasicSyncOptions,
    take: number,
  ): Promise<string[]> {
    const divs = options.divs ?? NMC_MAJOR_DIVS;
    const order = Prisma.join(divs.map((div) => Prisma.sql`${div}`));

    const scope = options.clinics
      ? // 3단계: 규모기관이 아닌 전부 (의원·치과의원·한의원·보건소 등)
        Prisma.sql`(duty_div IS NULL OR duty_div NOT IN (${order}))`
      : Prisma.sql`duty_div IN (${order})`;

    const notDone = options.force
      ? Prisma.sql`1 = 1`
      : Prisma.sql`basic_synced_at IS NULL`;

    // 의원급은 등급 우선순위가 없다. 규모기관만 FIELD() 로 순서를 준다.
    const rows = options.clinics
      ? await this.prisma.$queryRaw<{ hpid: string }[]>(
          Prisma.sql`SELECT hpid FROM nmc_hospital WHERE ${scope} AND ${notDone} LIMIT ${take}`,
        )
      : await this.prisma.$queryRaw<{ hpid: string }[]>(
          Prisma.sql`
            SELECT hpid FROM nmc_hospital
             WHERE ${scope} AND ${notDone}
             ORDER BY FIELD(duty_div, ${order})
             LIMIT ${take}
          `,
        );

    return rows.map((row) => row.hpid);
  }

  private async countTargets(options: BasicSyncOptions): Promise<number> {
    const divs = options.divs ?? NMC_MAJOR_DIVS;
    const order = Prisma.join(divs.map((div) => Prisma.sql`${div}`));

    const scope = options.clinics
      ? Prisma.sql`(duty_div IS NULL OR duty_div NOT IN (${order}))`
      : Prisma.sql`duty_div IN (${order})`;
    const notDone = options.force
      ? Prisma.sql`1 = 1`
      : Prisma.sql`basic_synced_at IS NULL`;

    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) c FROM nmc_hospital WHERE ${scope} AND ${notDone}`,
    );
    return Number(rows[0]?.c ?? 0);
  }

  /** 한 병원의 basic 을 받아 저장하고, 진료과목을 코드로 환산해 갱신한다. */
  private async fetchAndStore(hpid: string): Promise<void> {
    const response = await this.client.getHospitalBasisInfo(hpid);
    const item = response.response?.body?.items?.item?.[0];

    // --debug 로만 보인다. 8만 건이면 로그가 8만 줄이 된다.
    this.logger.debug(
      item
        ? `${hpid} ${asString(item.dutyName) ?? ''} — 필드 ${Object.keys(item).length}, 병상 ${asString(item.hpbdn) ?? '-'}, 과목 ${(asString(item.dgidIdName) ?? '').split(',').filter(Boolean).length}`
        : `${hpid} — 응답 없음`,
    );

    // 응답이 없어도 받았다는 사실은 남긴다. 안 그러면 매번 다시 조회한다.
    const data = item ?? {};

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE nmc_hospital
           SET basic = CAST(${JSON.stringify(data)} AS JSON),
               basic_synced_at = NOW()
         WHERE hpid = ${hpid}
      `,
    );

    if (item) {
      await this.upsertSubjects(hpid, item);
    }
  }

  /**
   * basic 의 dgidIdName 을 진료과목 매핑에 반영한다.
   *
   * 원본은 쉼표로 이어 붙인 과목명 문자열이다("내과,외과,정형외과").
   * 코드마스터(D000)의 이름과 붙여 코드로 되돌린다. 실측 25/25 매칭이다.
   *
   * source='basic' 으로 남긴다. 1단계 역조회(source='list')가 나중에 이걸 되돌리지 않도록,
   * 역조회 쪽 upsert 가 'basic' 이면 source 를 유지한다.
   */
  private async upsertSubjects(
    hpid: string,
    item: HospitalBasisInfoItem,
  ): Promise<void> {
    const names = (asString(item.dgidIdName) ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return;
    }

    const codes = await this.prisma.nmc_code.findMany({
      where: { cm_mid: 'D000', cm_snm: { in: names } },
      select: { cm_sid: true, cm_snm: true },
    });

    if (codes.length === 0) {
      return;
    }

    const values = Prisma.join(
      codes.map(
        (code) =>
          Prisma.sql`(${hpid}, ${code.cm_sid}, ${code.cm_snm}, 'basic', NOW())`,
      ),
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO nmc_hospital_subject (hpid, subject_cd, subject_nm, source, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          subject_nm = new.subject_nm,
          source     = 'basic',
          synced_at  = NOW()
      `,
    );

    const missing = names.length - codes.length;
    if (missing > 0) {
      this.logger.warn(
        `${hpid}: 코드마스터(D000)에 없는 과목명 ${missing}건 — ${names.join(',')}`,
      );
    }
  }
}
