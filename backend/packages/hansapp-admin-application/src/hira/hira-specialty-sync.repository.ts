import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/**
 * HIRA 전문병원 지정 저장소. 코드 축 조회·매핑 적재·워터마크·정리를 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다. 서비스는 원본 호출·파싱·루프·정합성 판단만 하고 SQL 은
 * 만지지 않는다.
 */
@Injectable()
export class HiraSpecialtySyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 돌 축이 되는 전문병원지정분야 코드(tp='specialty'). */
  findSpecialtyCodes(): Promise<{ cd: string; cdNm: string | null }[]> {
    return this.prisma.hiraCode.findMany({
      where: { tp: 'specialty' },
      orderBy: { cd: 'asc' },
      select: { cd: true, cdNm: true },
    });
  }

  /** DB 의 현재 시각. 워터마크를 앱 시계로 잡지 않기 위한 것이다. */
  async now(): Promise<Date> {
    const rows = await this.prisma.$queryRaw<{ now: Date }[]>(
      Prisma.sql`SELECT NOW() now`,
    );
    return rows[0].now;
  }

  /**
   * 분야는 호출자가 정한 srchCd 로 고정한다. 응답에는 없다.
   * srch_nm 은 hira_code 에서 가져온다 — 목록 API 가 코드명을 주지 않는다.
   */
  async upsertSrch(
    ykihos: string[],
    srchCd: string,
    srchNm: string | null,
  ): Promise<void> {
    const values = Prisma.join(
      ykihos.map(
        (ykiho) =>
          Prisma.sql`(${ykiho}, 'specialty', ${srchCd}, ${srchNm}, NOW())`,
      ),
    );

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO hira_hospital_srch (ykiho, tp, srch_cd, srch_nm, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          srch_nm   = new.srch_nm,
          synced_at = NOW()
      `,
    );
  }

  /**
   * 이번 전수에 없던 specialty 행을 지운다. 지운 행 수를 반환한다.
   * tp='specialty' 만 건드린다. special(특수진료)은 여전히 개별 조회 소관이다.
   */
  async removeStale(startedAt: Date): Promise<number> {
    const removed = await this.prisma.hiraHospitalSrch.deleteMany({
      where: { tp: 'specialty', syncedAt: { lt: startedAt } },
    });
    return removed.count;
  }
}
