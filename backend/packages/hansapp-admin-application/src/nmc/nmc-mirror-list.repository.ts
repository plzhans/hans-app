import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type NmcHospital } from '@hansapp/data';

/** nmc_hospital 목록 조회 조건. healthcare_hospital 과 무관하게 NMC 미러만 놓고 찾는다. */
export interface NmcMirrorListFilter {
  /** 병원명(원본 dutyName) 부분 일치 또는 기관ID 정확 일치. */
  keyword?: string;
  sidoNm?: string;
  sgguNm?: string;
  dutyDiv?: string;
}

export interface NmcMirrorListPage {
  rows: NmcHospital[];
  total: number;
}

/**
 * NMC 병원 미러(nmc_hospital) 목록.
 *
 * **이름은 JSON 컬럼(data.dutyName) 안에 있다.** NMC 는 지역을 코드가 아니라 이름으로만
 * 주므로(스키마 주석 참고) 지역 필터도 코드가 아니라 문자열(sidoNm/sgguNm) 이다 — HIRA
 * 목록(HiraMirrorListRepository)과 조건 모양이 다른 이유다.
 */
@Injectable()
export class NmcMirrorListRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: NmcMirrorListFilter, page: number, size: number): Promise<NmcMirrorListPage> {
    const where = this.buildWhere(filter);
    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<NmcHospital[]>(Prisma.sql`
        SELECT hpid, data, basic,
               created_at AS createdAt, updated_at AS updatedAt, synced_at AS syncedAt,
               sido_nm AS sidoNm, sggu_nm AS sgguNm, duty_div AS dutyDiv,
               basic_synced_at AS basicSyncedAt
          FROM nmc_hospital
         WHERE ${where}
         ORDER BY hpid
         LIMIT ${size} OFFSET ${(page - 1) * size}
      `),
      this.prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) c FROM nmc_hospital WHERE ${where}
      `),
    ]);
    return { rows, total: Number(totalRows[0]?.c ?? 0) };
  }

  private buildWhere(filter: NmcMirrorListFilter): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (filter.keyword) {
      const kw = `%${filter.keyword}%`;
      conditions.push(Prisma.sql`(
        JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyName')) LIKE ${kw}
        OR hpid = ${filter.keyword}
      )`);
    }
    if (filter.sidoNm) {
      conditions.push(Prisma.sql`sido_nm = ${filter.sidoNm}`);
    }
    if (filter.sgguNm) {
      conditions.push(Prisma.sql`sggu_nm = ${filter.sgguNm}`);
    }
    if (filter.dutyDiv) {
      conditions.push(Prisma.sql`duty_div = ${filter.dutyDiv}`);
    }
    return Prisma.join(conditions, ' AND ');
  }
}
