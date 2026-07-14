import { Prisma, PrismaService } from '@hansapi/data';

/** 한 번의 INSERT 에 담을 행 수. 코드는 수백 건이라 사실상 한 번에 들어간다. */
const CHUNK_SIZE = 500;

/** 코드 테이블 한 행. 키 컬럼과 값 컬럼을 컬럼명 그대로 담는다. */
export type CodeRow = Record<string, string | null>;

/**
 * 코드 테이블에 벌크 upsert 한다.
 *
 * 병원(mirror-upsert)과 달리 코드는 JSON 이 아니라 컬럼으로 펼쳐 넣는다. 필드가 적고
 * 스펙이 안정적이며, 병원 데이터의 코드값과 조인할 대상이기 때문이다.
 *
 * updated_at 은 값이 **실제로 바뀐 경우에만** 갱신한다(NULL 안전 비교 `<=>`).
 * synced_at 은 매번 갱신한다. 두 컬럼의 의미가 다르다.
 *   updated_at 어떤 경로로든(관리자 수정 포함) 행이 바뀐 시각
 *   synced_at  API 로 조회해 upsert 한 시각
 *
 * SET 절은 왼쪽부터 평가되므로 updated_at 을 값 대입보다 **앞에** 둬야 비교 시점의 값이 옛 값이다.
 * 컬럼명은 테이블로 한정한다. 행 별칭(new)에 같은 이름이 있어 그냥 쓰면 MySQL 이 모호하다고 거부한다(1052).
 *
 * @returns 처리한 행 수. `$executeRaw` 의 반환값은 신규 1·갱신 2·무변경 0 이라 건수로 못 쓴다.
 */
export async function upsertCodeRows(
  prisma: PrismaService,
  table: 'nmc_code' | 'hira_code',
  keyColumns: readonly string[],
  valueColumns: readonly string[],
  rows: readonly CodeRow[],
): Promise<number> {
  const columns = [...keyColumns, ...valueColumns];
  const self = Prisma.raw(table);
  let processed = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    // 테이블명·컬럼명은 코드 상수라 외부 입력이 섞이지 않는다. 값은 전부 바인딩 파라미터로 나간다.
    const values = Prisma.join(
      chunk.map(
        (row) =>
          Prisma.sql`(${Prisma.join(columns.map((column) => Prisma.sql`${row[column] ?? null}`))}, NOW(), NOW(), NOW())`,
      ),
    );

    const unchanged = Prisma.join(
      valueColumns.map(
        (column) =>
          Prisma.sql`${self}.${Prisma.raw(column)} <=> new.${Prisma.raw(column)}`,
      ),
      ' AND ',
    );

    const assignments = Prisma.join(
      valueColumns.map(
        (column) =>
          Prisma.sql`${Prisma.raw(column)} = new.${Prisma.raw(column)}`,
      ),
    );

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO ${self}
          (${Prisma.raw(columns.join(', '))}, created_at, updated_at, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          updated_at = IF(${unchanged}, ${self}.updated_at, NOW()),
          synced_at  = NOW(),
          ${assignments}
      `,
    );

    processed += chunk.length;
  }

  return processed;
}
