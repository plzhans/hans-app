import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapi/data';
import { HIRA_CODE_TYPES } from '@hansapi/application';
import { HIRA_CODES } from '@hansapi/data/seed';

export interface HiraCodeSeedResult {
  seeded: number;

  /** 시드에서 빠져 지운 코드 수. */
  removed: number;
}

/**
 * HIRA 코드 시드 (hira_code 중 API 가 코드표를 안 주는 것).
 *
 * 시드 파일이 **유일한 원본**이다. 병원평가 항목(tp='asm01'~'asm09')이 여기 해당한다 —
 * API 는 asmGrd01 같은 필드명으로만 주고, 그게 급성기뇌졸중인지는 메뉴얼·홈페이지에만 있다.
 * tp 가 곧 그룹이다(급성질환·만성질환…). hira_code 의 tp → cd 2단 계층을 그대로 쓴다.
 *
 * **소유가 tp 로 갈린다.** sync(HiraCodeSyncService)가 HIRA_CODE_TYPES(6종)를 소유하고,
 * 시드는 **그 6종이 아닌 나머지 전부**를 소유한다. 서로의 행에 손대지 않는다.
 */
@Injectable()
export class HiraCodeSeedService {
  private readonly logger = new Logger(HiraCodeSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(): Promise<HiraCodeSeedResult> {
    const values = Prisma.join(
      HIRA_CODES.map(
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

    const removed = await this.removeStale();

    return { seeded: HIRA_CODES.length, removed };
  }

  /**
   * 시드에서 빠진 코드를 지운다. 시드가 원본이므로 DB 에만 있는 코드는 유령이다.
   *
   * **소유 범위를 "sync 6종이 아닌 것" 으로 잡는다.** 시드에 있는 tp 목록으로 잡으면 안 된다 —
   * tp 이름을 바꾸거나 그룹을 없앤 순간 옛 tp 가 목록에서 빠져, 그 행들이 영영 안 지워지고
   * 유령으로 남는다(asm→asm01 로 바꿨을 때 실제로 그랬다). "우리 것이 아닌 건 sync 것뿐" 이
   * 진짜 불변식이다.
   *
   * 반대로 한정 자체를 빼면 sync 가 채운 6종이 시드에 없다는 이유로 전부 지워진다.
   */
  private async removeStale(): Promise<number> {
    const keep = new Set(HIRA_CODES.map((c) => `${c.tp}|${c.cd}`));

    const existing = await this.prisma.hira_code.findMany({
      where: { tp: { notIn: [...HIRA_CODE_TYPES] } },
      select: { tp: true, cd: true },
    });
    const stale = existing.filter((row) => !keep.has(`${row.tp}|${row.cd}`));

    for (const row of stale) {
      await this.prisma.hira_code.delete({
        where: { tp_cd: { tp: row.tp, cd: row.cd } },
      });
      this.logger.log(`시드에서 빠진 코드 삭제: ${row.tp}/${row.cd}`);
    }

    return stale.length;
  }
}
