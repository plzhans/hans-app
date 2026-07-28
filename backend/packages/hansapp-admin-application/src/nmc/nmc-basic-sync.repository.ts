import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/**
 * NMC basic 적재 저장소. 작업 큐 조회(아직 안 받은 병원)와 basic·진료과목 적재를 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다(bulk UPDATE·ON DUPLICATE KEY). 서비스는 원본 호출·파싱·루프
 * 같은 오케스트레이션만 하고 SQL 은 만지지 않는다. divs/clinics/force 로 WHERE 를 만드는 것도 여기다.
 */
@Injectable()
export class NmcBasicSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 아직 basic 을 안 받은(또는 force 면 전체) 대상 병원 수. */
  async countPending(
    divs: readonly string[],
    clinics: boolean,
    force: boolean,
  ): Promise<number> {
    const { scope, notDone } = this.buildFilter(divs, clinics, force);
    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) c FROM nmc_hospital WHERE ${scope} AND ${notDone}`,
    );
    return Number(rows[0]?.c ?? 0);
  }

  /**
   * 작업 큐 한 배치. 규모기관은 등급 우선순위(FIELD)로, 의원급은 순서 없이 꺼낸다.
   * duty_div 는 generated column 이라 JSON 을 열지 않고 인덱스만 읽는다.
   */
  async pickPending(
    divs: readonly string[],
    clinics: boolean,
    force: boolean,
    take: number,
  ): Promise<string[]> {
    const { scope, notDone, order } = this.buildFilter(divs, clinics, force);

    // 의원급은 등급 우선순위가 없다. 규모기관만 FIELD() 로 순서를 준다.
    const rows = clinics
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

  /** basic 원문을 저장한다. 응답이 없어도(빈 객체) 받았다는 사실은 basic_synced_at 으로 남긴다. */
  async storeBasic(hpid: string, data: unknown): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE nmc_hospital
           SET basic = CAST(${JSON.stringify(data)} AS JSON),
               basic_synced_at = NOW()
         WHERE hpid = ${hpid}
      `,
    );
  }

  /** 과목명 → 코드마스터(D000) 매칭. */
  findSubjectCodes(
    names: string[],
  ): Promise<{ cmSid: string; cmSnm: string | null }[]> {
    return this.prisma.nmcCode.findMany({
      where: { cmMid: 'D000', cmSnm: { in: names } },
      select: { cmSid: true, cmSnm: true },
    });
  }

  /**
   * 진료과목을 source='basic' 으로 upsert 한다.
   * 역조회(source='list')가 나중에 되돌리지 않도록, upsert 가 'basic' 이면 source 를 유지한다.
   */
  async upsertSubjects(
    hpid: string,
    codes: { cmSid: string; cmSnm: string | null }[],
  ): Promise<void> {
    const values = Prisma.join(
      codes.map(
        (code) =>
          Prisma.sql`(${hpid}, ${code.cmSid}, ${code.cmSnm}, 'basic', NOW())`,
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
  }

  /**
   * divs·clinics·force 로 WHERE 조각을 만든다.
   * clinics=규모기관이 아닌 전부, force=이미 받은 것도 다시.
   */
  private buildFilter(
    divs: readonly string[],
    clinics: boolean,
    force: boolean,
  ): { scope: Prisma.Sql; notDone: Prisma.Sql; order: Prisma.Sql } {
    const order = Prisma.join(divs.map((div) => Prisma.sql`${div}`));
    const scope = clinics
      ? // 규모기관이 아닌 전부 (의원·치과의원·한의원·보건소 등)
        Prisma.sql`(duty_div IS NULL OR duty_div NOT IN (${order}))`
      : Prisma.sql`duty_div IN (${order})`;
    const notDone = force
      ? Prisma.sql`1 = 1`
      : Prisma.sql`basic_synced_at IS NULL`;
    return { scope, notDone, order };
  }
}
