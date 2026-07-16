import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapi/data';
import {
  HEALTHCARE_CODES,
  IGNORED_SOURCE_CODES,
  REGION_CODES,
  type HealthcareCodeSeed,
} from '@hansapi/data/seed';

export interface CodeSeedResult {
  seeded: number;
  regions: number;
  removed: number;

  /** 원본에는 있는데 시드에 없는 코드. 새 코드가 생겼다는 뜻이다. */
  unmapped: { tp: string; src: string; cd: string; nm: string }[];
}

/**
 * 통합 코드 시드.
 *
 * 시드 파일이 **유일한 원본**이다. DB 에 직접 INSERT 하지 않는다 —
 * 재현이 안 되고, 환경마다 손으로 넣어야 하고, 누가 언제 바꿨는지 안 남는다.
 *
 * 두 가지를 검사한다.
 *   1. 중복 매핑 — 원본 코드 하나가 우리 코드 둘에 붙으면 배치가 조용히 덮어쓰고 틀린다. 실패시킨다.
 *   2. 미매핑    — 원본에 새 코드가 생겼는데 시드에 없으면, 적재할 때 그 값이 소리 없이 사라진다.
 *                  경고로 알린다. 사람이 시드에 한 줄 추가하면 된다.
 */
@Injectable()
export class HealthcareCodeSeedService {
  private readonly logger = new Logger(HealthcareCodeSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(): Promise<CodeSeedResult> {
    this.assertNoDuplicateMapping(HEALTHCARE_CODES);

    const values = Prisma.join(
      HEALTHCARE_CODES.map(
        // title 은 표시용이라 생략하면 nm(관리용)을 복사한다.
        (code) => Prisma.sql`(
          ${code.tp}, ${code.cd}, ${code.nm}, ${code.title ?? code.nm},
          ${code.title_en ?? null}, ${code.title_ja ?? null}, ${code.title_zh ?? null},
          ${code.cmt ?? null},
          ${code.hira_cd ? JSON.stringify(code.hira_cd) : null},
          ${code.nmc_cd ? JSON.stringify(code.nmc_cd) : null},
          ${code.sort}, NOW(), NOW()
        )`,
      ),
    );

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO healthcare_code
        (tp, cd, nm, title, title_en, title_ja, title_zh, cmt, hira_cd, nmc_cd, sort, created_at, updated_at)
      VALUES ${values} AS new
      ON DUPLICATE KEY UPDATE
        nm = new.nm, title = new.title, title_en = new.title_en, title_ja = new.title_ja,
        title_zh = new.title_zh,
        cmt = new.cmt,
        hira_cd = new.hira_cd, nmc_cd = new.nmc_cd,
        sort = new.sort, updated_at = NOW()
    `);

    // 시드에서 빠진 코드는 지운다. 시드가 원본이므로 DB 에만 있는 코드는 유령이다.
    const keep = HEALTHCARE_CODES.map((c) => `${c.tp}|${c.cd}`);
    const existing = await this.prisma.healthcare_code.findMany({
      select: { tp: true, cd: true },
    });
    const stale = existing.filter(
      (row) => !keep.includes(`${row.tp}|${row.cd}`),
    );

    for (const row of stale) {
      await this.prisma.healthcare_code.delete({
        where: { tp_cd: { tp: row.tp, cd: row.cd } },
      });
    }

    await this.seedRegions();

    const unmapped = await this.findUnmapped();
    for (const row of unmapped) {
      this.logger.warn(
        `시드에 없는 원본 코드: ${row.tp}/${row.src} ${row.cd}(${row.nm}) — 시드에 추가해야 한다`,
      );
    }

    return {
      seeded: HEALTHCARE_CODES.length,
      regions: REGION_CODES.length,
      removed: stale.length,
      unmapped,
    };
  }

  /**
   * 지역 코드. 시도는 법정동코드 2자리, 시군구는 자체 부여(시도+3자리)다.
   * NMC 이름 매핑은 매칭된 병원 76,704쌍의 다수결로 뽑았다 — 사람이 짝지은 게 아니다.
   */
  private async seedRegions(): Promise<void> {
    const values = Prisma.join(
      REGION_CODES.map(
        (region) => Prisma.sql`(
          ${region.cd}, ${region.nm},
          ${region.nm_en ?? null}, ${region.nm_ja ?? null},
          ${region.short_nm ?? null},
          ${region.level}, ${region.parent_cd ?? null},
          ${region.hira_cd ? JSON.stringify(region.hira_cd) : null},
          ${region.nmc_nm ? JSON.stringify(region.nmc_nm) : null},
          ${region.sort}, NOW(), NOW()
        )`,
      ),
    );

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO region_code
        (cd, nm, nm_en, nm_ja, short_nm, level, parent_cd, hira_cd, nmc_nm, sort, created_at, updated_at)
      VALUES ${values} AS new
      ON DUPLICATE KEY UPDATE
        nm = new.nm, nm_en = new.nm_en, nm_ja = new.nm_ja, short_nm = new.short_nm,
        level = new.level, parent_cd = new.parent_cd,
        hira_cd = new.hira_cd, nmc_nm = new.nmc_nm,
        sort = new.sort, updated_at = NOW()
    `);
  }

  /**
   * 원본 코드 하나가 우리 코드 둘에 매핑되면 안 된다.
   * 배치가 맵을 만들 때 나중 것이 덮어써서 조용히 틀린 코드로 적재된다.
   */
  private assertNoDuplicateMapping(codes: HealthcareCodeSeed[]): void {
    const seen = new Map<string, string>();

    for (const code of codes) {
      for (const [src, list] of [
        ['hira', code.hira_cd],
        ['nmc', code.nmc_cd],
      ] as const) {
        for (const sourceCode of list ?? []) {
          const key = `${code.tp}|${src}|${sourceCode}`;
          const owner = seen.get(key);
          if (owner !== undefined) {
            throw new Error(
              `중복 매핑: ${key} 가 ${owner} 와 ${code.cd} 양쪽에 있다. 시드를 고쳐라.`,
            );
          }
          seen.set(key, code.cd);
        }
      }
    }
  }

  /** 원본에는 있는데 시드에 없는 코드를 찾는다. 새 코드가 생기면 여기 걸린다. */
  private async findUnmapped(): Promise<CodeSeedResult['unmapped']> {
    const codes = await this.prisma.healthcare_code.findMany();
    const mapped = new Set<string>();

    for (const code of codes) {
      for (const [src, raw] of [
        ['hira', code.hira_cd],
        ['nmc', code.nmc_cd],
      ] as const) {
        for (const sourceCode of (raw as string[] | null) ?? []) {
          mapped.add(`${code.tp}|${src}|${sourceCode}`);
        }
      }
    }

    const ignored = (tp: string, src: string): readonly string[] =>
      (
        IGNORED_SOURCE_CODES as Record<
          string,
          Record<string, readonly string[]>
        >
      )[tp]?.[src] ?? [];

    const unmapped: CodeSeedResult['unmapped'] = [];

    const hira = await this.prisma.hira_code.findMany({
      where: {
        tp: { in: ['subject', 'class', 'equipment', 'specialty', 'special'] },
      },
      select: { tp: true, cd: true, cd_nm: true },
    });
    for (const row of hira) {
      if (
        !mapped.has(`${row.tp}|hira|${row.cd}`) &&
        !ignored(row.tp, 'hira').includes(row.cd)
      ) {
        unmapped.push({
          tp: row.tp,
          src: 'hira',
          cd: row.cd,
          nm: row.cd_nm ?? '',
        });
      }
    }

    // NMC 는 대분류코드로 종류가 갈린다. D000=진료과목, H000=기관구분.
    const nmcGroups: [string, string][] = [
      ['D000', 'subject'],
      ['H000', 'class'],
    ];
    for (const [cmMid, tp] of nmcGroups) {
      const rows = await this.prisma.nmc_code.findMany({
        where: { cm_mid: cmMid },
        select: { cm_sid: true, cm_snm: true },
      });
      for (const row of rows) {
        if (
          !mapped.has(`${tp}|nmc|${row.cm_sid}`) &&
          !ignored(tp, 'nmc').includes(row.cm_sid)
        ) {
          unmapped.push({
            tp,
            src: 'nmc',
            cd: row.cm_sid,
            nm: row.cm_snm ?? '',
          });
        }
      }
    }

    return unmapped;
  }
}
