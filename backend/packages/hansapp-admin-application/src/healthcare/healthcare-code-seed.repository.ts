import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';
import { REGION_CODES, type HealthcareCodeSeed } from '@hansapp/data/seed';

/**
 * 통합 코드 시드 저장소. 코드·지역 벌크 upsert 와 유령/미매핑 판정용 조회를 담당한다.
 *
 * 시드 배열을 그대로 받아 ON DUPLICATE KEY 로 밀어 넣는 raw SQL 이 여기 있다. 서비스는
 * 중복·미매핑 검사 같은 판단만 하고, 어떤 코드가 유령인지 결정한 뒤 지우라고 시킬 뿐이다.
 */
@Injectable()
export class HealthcareCodeSeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 통합 코드 마스터(healthcare_code)를 시드 배열로 벌크 upsert. */
  async seedCodes(codes: readonly HealthcareCodeSeed[]): Promise<void> {
    const values = Prisma.join(
      codes.map(
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
  }

  /**
   * 지역 코드(region_code)를 시드 배열로 벌크 upsert.
   * 시도는 법정동코드 2자리, 시군구는 자체 부여(시도+3자리)다.
   */
  async seedRegions(): Promise<void> {
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

  /** DB 에 이미 있는 코드 키(tp, cd). 시드에서 빠진 유령을 가리는 데 쓴다. */
  findExistingCodes(): Promise<{ tp: string; cd: string }[]> {
    return this.prisma.healthcareCode.findMany({
      select: { tp: true, cd: true },
    });
  }

  /** 유령 코드 하나를 지운다. tp+cd 가 복합 PK 다. */
  async deleteCode(tp: string, cd: string): Promise<void> {
    await this.prisma.healthcareCode.delete({
      where: { tp_cd: { tp, cd } },
    });
  }

  /** 통합 코드 전체의 매핑(hira_cd·nmc_cd). 원본 코드가 이미 매핑됐는지 판정한다. */
  findMappedCodes(): Promise<
    { tp: string; hiraCd: Prisma.JsonValue; nmcCd: Prisma.JsonValue }[]
  > {
    return this.prisma.healthcareCode.findMany({
      select: { tp: true, hiraCd: true, nmcCd: true },
    });
  }

  /** 미매핑 검사 대상 HIRA 코드. */
  findHiraCodes(): Promise<{ tp: string; cd: string; cdNm: string | null }[]> {
    return this.prisma.hiraCode.findMany({
      where: {
        tp: { in: ['subject', 'class', 'equipment', 'specialty', 'special'] },
      },
      select: { tp: true, cd: true, cdNm: true },
    });
  }

  /** 미매핑 검사 대상 NMC 코드. 대분류코드(cmMid)로 종류가 갈린다. */
  findNmcCodes(
    cmMid: string,
  ): Promise<{ cmSid: string; cmSnm: string | null }[]> {
    return this.prisma.nmcCode.findMany({
      where: { cmMid: cmMid },
      select: { cmSid: true, cmSnm: true },
    });
  }
}
