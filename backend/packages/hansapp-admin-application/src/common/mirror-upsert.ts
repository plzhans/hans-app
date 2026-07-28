import { Prisma, PrismaService } from '@hansapp/data';

/** 한 번의 INSERT 에 담을 행 수. 너무 크면 max_allowed_packet 에 걸린다. */
const CHUNK_SIZE = 500;

export interface MirrorRow {
  /** PK 값 (hpid / ykiho) */
  key: string;

  /** API 응답 item 원본. JSON 컬럼에 통째로 들어간다. */
  data: unknown;
}

/**
 * 미러 테이블에 벌크 upsert 한다.
 *
 * Prisma 는 벌크 upsert 를 제공하지 않는다. 한 건씩 upsert 하면 8만 건에 왕복이 8만 번이라
 * 현실적이지 않으므로 `INSERT ... ON DUPLICATE KEY UPDATE` 를 직접 쓴다.
 *
 * MySQL 8.0.19+ 의 행 별칭(`AS new`) 문법을 쓴다. 예전 `VALUES()` 함수는 deprecated 다.
 *
 * @returns 처리한 행 수. `$executeRaw` 의 반환값은 신규 1·갱신 2·무변경 0 이라 건수로 못 쓴다.
 */
export async function upsertMirrorRows(
  prisma: PrismaService,
  table:
    | 'nmc_hospital'
    | 'hira_hospital'
    | 'nmc_baby_hospital'
    | 'hira_hospital_asm',
  keyColumn: 'hpid' | 'ykiho',
  rows: MirrorRow[],
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    // JSON 으로 캐스팅해서 넣는다. 문자열로 두면 아래 비교(data = new.data)가 항상 거짓이 된다.
    // MySQL 에서 JSON 컬럼과 문자열을 비교하면 타입이 달라 같지 않다고 판정하기 때문이다.
    const values = Prisma.join(
      chunk.map(
        (row) =>
          Prisma.sql`(${row.key}, CAST(${JSON.stringify(row.data)} AS JSON), NOW(), NOW(), NOW())`,
      ),
    );

    // 테이블명·컬럼명은 리터럴 유니온 타입이라 외부 입력이 섞일 여지가 없다.
    // 값은 전부 바인딩 파라미터로 나간다.
    //
    // updated_at 은 data 가 **실제로 바뀐 경우에만** 갱신한다.
    // 매번 갱신하면 "마지막 동기화 시각"과 다를 바 없어져, 변경된 병원만 골라
    // 상세정보를 다시 받는 증분 처리를 할 수 없다(상세는 병원당 1콜이라 전량 재조회가 불가능하다).
    //
    // SET 절은 왼쪽부터 순서대로 평가된다. updated_at 을 data 대입보다 **앞에** 둬야
    // 비교 시점의 data 가 아직 옛 값이다. 순서를 바꾸면 항상 같다고 판정된다.
    //
    // 컬럼명은 테이블로 한정해야 한다. 행 별칭(new)에도 같은 이름이 있어
    // 그냥 data 라고 쓰면 MySQL 이 모호하다고 거부한다(1052).
    //
    // MySQL 의 JSON 비교(=)는 정규화 후 값으로 비교하므로 키 순서는 영향이 없다.
    const self = Prisma.raw(table);
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO ${Prisma.raw(table)}
          (${Prisma.raw(keyColumn)}, data, created_at, updated_at, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          updated_at = IF(${self}.data = new.data, ${self}.updated_at, NOW()),
          synced_at  = NOW(),
          data       = new.data
      `,
    );

    processed += chunk.length;
  }

  return processed;
}
