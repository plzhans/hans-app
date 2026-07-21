import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapi/data';

/**
 * HIRA 개별(상세) 조회 저장소. 작업 큐 조회(미완성 병원)와 상세·검색축 적재를 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다(bulk INSERT ... ON DUPLICATE KEY). 서비스는 원본 호출·파싱·
 * 동시성·한도 처리 같은 오케스트레이션만 하고 SQL 은 만지지 않는다. clCd/excludeClCds/ops/force
 * 로 WHERE 를 만드는 것도 여기다.
 */
@Injectable()
export class HiraDetailSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countTargets(
    clCd: string | undefined,
    excludeClCds: readonly string[] | undefined,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) c FROM hira_hospital h WHERE ${this.scope(clCd, excludeClCds)}`,
    );
    return Number(rows[0]?.c ?? 0);
  }

  /**
   * 작업 큐. **요청한 오퍼레이션을 다 받지 못한 병원**을 꺼낸다.
   *
   * hira_hospital_detail 에 행이 없으면 아직 안 받은 것이다. 오퍼레이션 수만큼 행이 차면 완성이다.
   */
  async pickTargets(
    clCd: string | undefined,
    excludeClCds: readonly string[] | undefined,
    ops: readonly string[],
    force: boolean,
    take: number,
  ): Promise<string[]> {
    const scope = this.scope(clCd, excludeClCds);
    const done = force
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

  /** (병원, 오퍼레이션) 행이 이미 있는지. */
  async hasDetail(ykiho: string, op: string): Promise<boolean> {
    const found = await this.prisma.hiraHospitalDetail.findUnique({
      where: { ykiho_op: { ykiho, op } },
      select: { op: true },
    });
    return found !== null;
  }

  /**
   * 원본 응답을 통째로 보관한다. 1행짜리(info, facility)는 객체로, 여러 행은 배열로 넣는다.
   * 결과가 0건이어도 행을 만든다. 안 그러면 매번 다시 조회한다(전문병원이 아닌 병원의 specialty 등).
   */
  async storeDetail(
    ykiho: string,
    op: string,
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

  /** 장비(equipment)를 정규화 테이블 hira_hospital_equipment 에 적재한다. */
  async upsertEquipment(
    ykiho: string,
    rows: { cd: string; nm: string | null; cnt: number | null }[],
  ): Promise<void> {
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

  /** 검색 축(special/specialty)을 hira_hospital_srch 에 적재한다. */
  async upsertSrch(
    ykiho: string,
    tp: 'special' | 'specialty',
    rows: { cd: string; nm: string | null }[],
  ): Promise<void> {
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
  async upsertSubjects(
    ykiho: string,
    rows: {
      cd: string | null;
      nm: string | null;
      sdr: number | null;
      cdiag: number | null;
    }[],
  ): Promise<void> {
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

  /** 등급 조건. cl_cd 는 generated column 이라 JSON 을 열지 않는다. */
  private scope(
    clCd: string | undefined,
    excludeClCds: readonly string[] | undefined,
  ): Prisma.Sql {
    if (clCd) {
      return Prisma.sql`h.cl_cd = ${clCd}`;
    }
    if (excludeClCds?.length) {
      const list = Prisma.join(excludeClCds.map((cd) => Prisma.sql`${cd}`));
      return Prisma.sql`(h.cl_cd IS NULL OR h.cl_cd NOT IN (${list}))`;
    }
    return Prisma.sql`1 = 1`;
  }
}
