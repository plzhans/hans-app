import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type HiraHospital } from '@hansapp/data';

/**
 * hira_hospital 목록 조회 조건. **병원 목록 중심 검색이다** — healthcare_hospital(통합
 * 병원)과 무관하게, HIRA 미러 원본만 놓고 찾는다.
 */
export interface HiraMirrorListFilter {
  /** 병원명(원본 yadmNm) 부분 일치 또는 요양기호 정확 일치. */
  keyword?: string;
  sidoCd?: string;
  sgguCd?: string;
  clCd?: string;
}

export interface HiraMirrorListPage {
  rows: HiraHospital[];
  total: number;
}

/**
 * HIRA 병원 미러(hira_hospital) 목록.
 *
 * **이름은 JSON 컬럼(data.yadmNm) 안에 있다** — hira_hospital 은 API 응답을 그대로 담는
 * 미러라 이름을 위한 별도 컬럼이 없다. 그래서 검색은 $queryRaw + JSON_EXTRACT 다
 * (healthcare_hospital.name 처럼 평범한 컬럼 LIKE 를 쓸 수 없다). 인덱스가 없어 전수
 * 스캔이지만, 관리자 화면이라 트래픽이 적어 감수한다.
 */
@Injectable()
export class HiraMirrorListRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: HiraMirrorListFilter,
    page: number,
    size: number,
  ): Promise<HiraMirrorListPage> {
    const where = this.buildWhere(filter);
    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<HiraHospital[]>(Prisma.sql`
        SELECT ykiho, data,
               created_at AS createdAt, updated_at AS updatedAt, synced_at AS syncedAt,
               sido_cd AS sidoCd, sido_nm AS sidoNm, sggu_cd AS sgguCd, sggu_nm AS sgguNm,
               emdong_nm AS emdongNm, cl_cd AS clCd
          FROM hira_hospital
         WHERE ${where}
         ORDER BY ykiho
         LIMIT ${size} OFFSET ${(page - 1) * size}
      `),
      this.prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) c FROM hira_hospital WHERE ${where}
      `),
    ]);
    return { rows, total: Number(totalRows[0]?.c ?? 0) };
  }

  private buildWhere(filter: HiraMirrorListFilter): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (filter.keyword) {
      const kw = `%${filter.keyword}%`;
      conditions.push(Prisma.sql`(
        JSON_UNQUOTE(JSON_EXTRACT(data, '$.yadmNm')) LIKE ${kw}
        OR ykiho = ${filter.keyword}
      )`);
    }
    if (filter.sidoCd) {
      conditions.push(Prisma.sql`sido_cd = ${filter.sidoCd}`);
    }
    if (filter.sgguCd) {
      conditions.push(Prisma.sql`sggu_cd = ${filter.sgguCd}`);
    }
    if (filter.clCd) {
      conditions.push(Prisma.sql`cl_cd = ${filter.clCd}`);
    }
    return Prisma.join(conditions, ' AND ');
  }
}
