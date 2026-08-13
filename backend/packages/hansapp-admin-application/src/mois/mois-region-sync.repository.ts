import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/** 한 번의 INSERT 에 담을 행 수. 20,560행이면 42번 나눠 나간다. */
const CHUNK_SIZE = 500;

/**
 * replace 모드 트랜잭션의 최대 실행 시간.
 *
 * 전량 삭제 + 42회 INSERT 를 한 트랜잭션에 담는다. 실측 적재가 수 초라 넉넉하지만,
 * 기본값(5초)으로 두면 조금만 느려져도 롤백된다.
 */
const REPLACE_TIMEOUT_MS = 120_000;

/** 컬럼명 그대로 담은 한 행. 값 가공은 서비스가 끝내고 넘긴다. */
export interface RegionCodeRow {
  region_cd: string;
  sido_cd: string;
  sgg_cd: string;
  umd_cd: string;
  ri_cd: string;
  locatadd_nm: string;
  locallow_nm: string | null;
  level: string;
  locathigh_cd: string | null;
  locatjumin_cd: string | null;
  locatjijuk_cd: string | null;
  locat_order: number | null;
  locat_rm: string | null;
  adpt_de: string | null;
}

const KEY_COLUMN = 'region_cd';

/** upsert 시 갱신할 컬럼. 키와 타임스탬프를 뺀 나머지 전부다. */
const VALUE_COLUMNS = [
  'sido_cd',
  'sgg_cd',
  'umd_cd',
  'ri_cd',
  'locatadd_nm',
  'locallow_nm',
  'level',
  'locathigh_cd',
  'locatjumin_cd',
  'locatjijuk_cd',
  'locat_order',
  'locat_rm',
  'adpt_de',
] as const;

const ALL_COLUMNS = [KEY_COLUMN, ...VALUE_COLUMNS];

/** 트랜잭션 안이든 밖이든 같은 코드로 쓰기 위한 최소 인터페이스. */
type SqlClient = Pick<PrismaService, '$executeRaw'>;

/**
 * 법정동코드 미러 저장소.
 *
 * prisma 를 물려 **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다.
 * 서비스는 원본 호출·행 가공·정책 판단에만 집중한다.
 */
@Injectable()
export class MoisRegionSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 벌크 upsert (merge 모드). 처리한 행 수를 반환한다.
   *
   * 페이지가 도착할 때마다 부른다. 청크 하나하나가 그 자체로 유효한 상태라
   * 트랜잭션으로 묶지 않는다 — 중간에 죽어도 받은 데까지는 최신이다.
   */
  upsert(rows: readonly RegionCodeRow[]): Promise<number> {
    return upsertRows(this.prisma, rows);
  }

  /**
   * 전량 교체 (replace 모드). 삭제와 적재를 **한 트랜잭션**으로 묶는다.
   *
   * 중간에 실패하면 통째로 롤백돼 옛 데이터가 그대로 남는다. 트랜잭션 없이 하면
   * "지우고 나서 죽은" 순간에 테이블이 비어버린다 — 지역은 다른 데이터의 기준이라
   * 빈 채로 남으면 뒤따르는 모든 적재가 어긋난다.
   *
   * 그래서 호출부는 **전량을 다 받아 놓고** 이 함수를 부른다. 받으면서 지우면
   * 트랜잭션이 API 응답을 기다리는 동안 열려 있게 된다.
   *
   * TRUNCATE 가 아니라 DELETE 인 이유도 같다 — TRUNCATE 는 MySQL 에서 암묵적 커밋이라
   * 롤백이 되지 않는다.
   */
  async replaceAll(rows: readonly RegionCodeRow[]): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM mois_region_code`);
        return upsertRows(tx, rows);
      },
      { timeout: REPLACE_TIMEOUT_MS },
    );
  }

  /**
   * 이번 동기화에 오지 않은 행에 removed_at 을 찍는다. 찍은 행 수를 반환한다.
   *
   * 원본에 폐지 필드가 없어서 "안 온 것"이 곧 폐지다. 지우지 않는 이유는 병원 주소가
   * 폐지된 동을 가리킬 수 있어서다 — 지우면 그 주소에 이름을 못 붙인다.
   *
   * @param since 이번 실행이 시작된 시각. 이보다 synced_at 이 오래된 행이 대상이다.
   */
  markRemoved(since: Date): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE mois_region_code
         SET removed_at = NOW(), updated_at = NOW()
       WHERE synced_at < ${since}
         AND removed_at IS NULL
    `);
  }

  /** 살아 있는 행 수. 폐지 표시된 행은 뺀다. */
  countAlive(): Promise<number> {
    return this.prisma.moisRegionCode.count({ where: { removedAt: null } });
  }
}

/**
 * `INSERT ... ON DUPLICATE KEY UPDATE` 로 벌크 upsert 한다.
 *
 * Prisma 는 벌크 upsert 를 제공하지 않는다. 2만 건을 한 건씩 돌리면 왕복이 2만 번이다.
 * (common/code-upsert 와 같은 방식이지만, 이 테이블은 코드표가 아니라 지역 정본이고
 * removed_at 되살리기가 붙어서 헬퍼를 공유하지 않는다)
 *
 * updated_at 은 값이 **실제로 바뀐 경우에만** 갱신한다(NULL 안전 비교 `<=>`).
 * synced_at 은 매번 갱신한다 — 스윕이 이 값으로 "이번에 안 온 행"을 고른다.
 * removed_at 은 NULL 로 되돌린다. 폐지됐다가 되살아난 코드가 죽은 채로 남으면 안 된다.
 */
async function upsertRows(client: SqlClient, rows: readonly RegionCodeRow[]): Promise<number> {
  const self = Prisma.raw('mois_region_code');
  let processed = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    // 테이블명·컬럼명은 코드 상수라 외부 입력이 섞이지 않는다. 값은 전부 바인딩 파라미터로 나간다.
    const values = Prisma.join(
      chunk.map(
        (row) =>
          Prisma.sql`(${Prisma.join(
            ALL_COLUMNS.map((column) => Prisma.sql`${row[column as keyof RegionCodeRow] ?? null}`),
          )}, NOW(), NOW(), NOW())`,
      ),
    );

    const unchanged = Prisma.join(
      VALUE_COLUMNS.map(
        (column) => Prisma.sql`${self}.${Prisma.raw(column)} <=> new.${Prisma.raw(column)}`,
      ),
      ' AND ',
    );

    const assignments = Prisma.join(
      VALUE_COLUMNS.map((column) => Prisma.sql`${Prisma.raw(column)} = new.${Prisma.raw(column)}`),
    );

    // SET 절은 왼쪽부터 평가된다. updated_at 을 값 대입보다 **앞에** 둬야
    // 비교 시점의 값이 아직 옛 값이다. 순서를 바꾸면 항상 같다고 판정된다.
    // 컬럼명은 테이블로 한정한다 — 행 별칭(new)에 같은 이름이 있어 그냥 쓰면 MySQL 이 거부한다(1052).
    await client.$executeRaw(
      Prisma.sql`
        INSERT INTO ${self}
          (${Prisma.raw(ALL_COLUMNS.join(', '))}, created_at, updated_at, synced_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          updated_at = IF(${unchanged}, ${self}.updated_at, NOW()),
          synced_at  = NOW(),
          removed_at = NULL,
          ${assignments}
      `,
    );

    processed += chunk.length;
  }

  return processed;
}
