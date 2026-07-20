import { Prisma, PrismaService } from '@hansapi/data';

/** hira_npay_code 에 담을 한 행. 요약(List2)·크롤 두 소스가 공유하는 계약이다. */
export interface NpayCodeRow {
  cd: string;
  cdNm: string;
  sdivCd: string | null;
  sdivNm: string | null;
  mdivCd: string | null;
  mdivNm: string | null;
}

/** 한 번의 INSERT 에 담을 행 수. 너무 크면 max_allowed_packet 에 걸린다. */
const CHUNK_SIZE = 500;

/**
 * 비급여 코드마스터 upsert. **요약 sync 와 크롤 적재가 함께 쓴다.**
 *
 * **분류코드는 값이 있을 때만 갱신한다**(COALESCE(new, old)) — 한 소스가 먼저 채운 분류코드를
 * 다른 소스가 NULL 로 덮지 않게. i18n(_en/_ja/_zh)은 건드리지 않는다(번역이 채운다).
 *
 * updated_at 은 이름·분류가 실제로 바뀐 경우에만 갱신한다. SET 절이 왼쪽부터 평가되므로
 * 컬럼 대입보다 앞에 둬야 비교 시점의 값이 옛 값이다(mirror-upsert.ts 와 같은 이유).
 */
export async function upsertNpayCodes(
  prisma: PrismaService,
  rows: NpayCodeRow[],
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    const values = Prisma.join(
      chunk.map(
        (r) =>
          Prisma.sql`(${r.cd}, ${r.cdNm}, ${r.sdivCd}, ${r.sdivNm}, ${r.mdivCd}, ${r.mdivNm}, NOW(), NOW(), NOW())`,
      ),
    );

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO hira_npay_code
        (cd, cd_nm, sdiv_cd, sdiv_nm, mdiv_cd, mdiv_nm, created_at, updated_at, synced_at)
      VALUES ${values} AS new
      ON DUPLICATE KEY UPDATE
        updated_at = IF(
          hira_npay_code.cd_nm = new.cd_nm
            AND hira_npay_code.mdiv_cd <=> COALESCE(new.mdiv_cd, hira_npay_code.mdiv_cd)
            AND hira_npay_code.sdiv_cd <=> COALESCE(new.sdiv_cd, hira_npay_code.sdiv_cd),
          hira_npay_code.updated_at, NOW()),
        synced_at = NOW(),
        cd_nm   = new.cd_nm,
        sdiv_cd = COALESCE(new.sdiv_cd, hira_npay_code.sdiv_cd),
        sdiv_nm = COALESCE(new.sdiv_nm, hira_npay_code.sdiv_nm),
        mdiv_cd = COALESCE(new.mdiv_cd, hira_npay_code.mdiv_cd),
        mdiv_nm = COALESCE(new.mdiv_nm, hira_npay_code.mdiv_nm)
    `);

    processed += chunk.length;
  }

  return processed;
}
