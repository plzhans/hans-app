import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';
import type { HiraCodeSeed } from '@hansapp/data/seed';

/**
 * HIRA 코드 시드 저장소. 시드 벌크 upsert 와 유령 코드 조회·삭제를 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다(bulk INSERT ... ON DUPLICATE KEY). 시드 원본·소유 범위 판정
 * 같은 규칙은 서비스에 남고, 이 리포는 그 판정 결과로 DB 를 만지기만 한다.
 */
@Injectable()
export class HiraCodeSeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 시드 전량을 hira_code 에 벌크 upsert 한다. */
  async upsertSeed(codes: readonly HiraCodeSeed[]): Promise<void> {
    const values = Prisma.join(
      codes.map(
        (code) => Prisma.sql`(
          ${code.tp}, ${code.cd}, ${code.tpNm}, ${code.cdNm},
          ${code.tpNmEn}, ${code.tpNmJa}, ${code.tpNmZh},
          ${code.cdNmEn}, ${code.cdNmJa}, ${code.cdNmZh},
          ${code.cmt ?? null}, NOW(), NOW(), NOW()
        )`,
      ),
    );

    // synced_at 은 시드 행에선 의미가 없지만 NOT NULL 이라 채운다.
    // updated_at 은 값이 실제로 바뀐 경우에만 갱신한다(NULL 안전 비교 <=>).
    // SET 절은 왼쪽부터 평가되므로 updated_at 을 값 대입보다 앞에 둬야 비교 시점의 값이 옛 값이다.
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO hira_code
        (tp, cd, tp_nm, cd_nm,
         tp_nm_en, tp_nm_ja, tp_nm_zh,
         cd_nm_en, cd_nm_ja, cd_nm_zh,
         cd_cmt, created_at, updated_at, synced_at)
      VALUES ${values} AS new
      ON DUPLICATE KEY UPDATE
        updated_at = IF(
          hira_code.tp_nm <=> new.tp_nm AND hira_code.cd_nm <=> new.cd_nm
            AND hira_code.tp_nm_en <=> new.tp_nm_en AND hira_code.tp_nm_ja <=> new.tp_nm_ja
            AND hira_code.tp_nm_zh <=> new.tp_nm_zh
            AND hira_code.cd_nm_en <=> new.cd_nm_en AND hira_code.cd_nm_ja <=> new.cd_nm_ja
            AND hira_code.cd_nm_zh <=> new.cd_nm_zh
            AND hira_code.cd_cmt <=> new.cd_cmt,
          hira_code.updated_at, NOW()
        ),
        tp_nm = new.tp_nm, cd_nm = new.cd_nm,
        tp_nm_en = new.tp_nm_en, tp_nm_ja = new.tp_nm_ja, tp_nm_zh = new.tp_nm_zh,
        cd_nm_en = new.cd_nm_en, cd_nm_ja = new.cd_nm_ja, cd_nm_zh = new.cd_nm_zh,
        cd_cmt = new.cd_cmt
    `);
  }

  /**
   * 시드가 소유하는 범위(= sync 6종이 아닌 tp)의 코드를 모두 조회한다.
   * 이 목록에서 시드에 없는 것이 유령이다. 소유 범위 판정은 서비스가 한다.
   */
  findManagedCodes(
    excludeTps: readonly string[],
  ): Promise<{ tp: string; cd: string }[]> {
    return this.prisma.hiraCode.findMany({
      where: { tp: { notIn: [...excludeTps] } },
      select: { tp: true, cd: true },
    });
  }

  /** 유령 코드 한 건을 지운다. */
  async deleteCode(tp: string, cd: string): Promise<void> {
    await this.prisma.hiraCode.delete({
      where: { tp_cd: { tp, cd } },
    });
  }
}
