import { PrismaService } from '@hansapp/data';

/** 지역 재생성 결과 */
export interface RegionRebuildResult {
  /** 만들어진 지역 행 수 (시도×시군구 조합) */
  regions: number;

  /** 시도 종류 수 */
  sidos: number;
}

/**
 * 병원 데이터를 GROUP BY 해서 지역 목록을 다시 만든다. 병원 sync 직후에 호출한다.
 *
 * 증분 갱신(upsert)이 아니라 통째로 갈아엎는다. 집계라서 원본이 곧 정답이고,
 * 행이 수백 개뿐이라 비용이 없다. upsert 로 하면 "원본에서 사라진 지역"을 따로 지워야 하는데
 * 그 복잡도를 살 이유가 없다.
 *
 * 부분 sync(--full 아님) 뒤에 호출해도 안전하다. 집계 대상이 방금 받은 페이지가 아니라
 * 병원 테이블 전체이기 때문이다.
 */
export async function rebuildNmcRegions(prisma: PrismaService): Promise<RegionRebuildResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM nmc_region`;

    // sido_nm/sggu_nm 은 generated column 이라 JSON 을 열지 않고 인덱스만 읽는다.
    // 시도가 없는 행은 지역 목록에 담을 수 없으므로 제외한다(실측 0건).
    await tx.$executeRaw`
      INSERT INTO nmc_region (sido_nm, sggu_nm, hospital_cnt, updated_at)
      SELECT sido_nm, sggu_nm, COUNT(*), NOW()
        FROM nmc_hospital
       WHERE sido_nm IS NOT NULL
       GROUP BY sido_nm, sggu_nm
    `;

    return summarize(await tx.nmcRegion.findMany({ select: { sidoNm: true } }));
  });
}

/**
 * HIRA 지역 목록을 다시 만든다.
 *
 * 코드를 기준으로 묶는다. 같은 코드에 이름이 두 가지로 오는 행이 있기 때문이다.
 * (예: 360000 의 이름이 대부분 '전남광주' 인데 갱신 누락된 3건은 아직 '전남' 이다)
 * 이름은 MAX 로 하나만 고른다. 통합 후 이름이 옛 이름보다 뒤에 정렬되므로 현행 이름이 뽑힌다.
 */
export async function rebuildHiraRegions(prisma: PrismaService): Promise<RegionRebuildResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM hira_region`;

    await tx.$executeRaw`
      INSERT INTO hira_region (sido_cd, sido_nm, sggu_cd, sggu_nm, hospital_cnt, updated_at)
      SELECT sido_cd, MAX(sido_nm), sggu_cd, MAX(sggu_nm), COUNT(*), NOW()
        FROM hira_hospital
       WHERE sido_cd IS NOT NULL AND sggu_cd IS NOT NULL
       GROUP BY sido_cd, sggu_cd
    `;

    return summarize(await tx.hiraRegion.findMany({ select: { sidoNm: true } }));
  });
}

function summarize(rows: { sidoNm: string | null }[]): RegionRebuildResult {
  return {
    regions: rows.length,
    sidos: new Set(rows.map((row) => row.sidoNm)).size,
  };
}
