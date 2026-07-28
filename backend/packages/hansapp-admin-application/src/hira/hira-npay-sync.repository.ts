import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';
import type { NonPaymentDetailItem } from '@krdata/hira';

/** 한 번의 INSERT 에 담을 행 수. 너무 크면 max_allowed_packet 에 걸린다. */
const CHUNK_SIZE = 500;

/**
 * HIRA 비급여 저장소. (ykiho, sno) 복합키 벌크 upsert 와 사라진 행 삭제를 담당한다.
 *
 * upsertMirrorRows 를 쓰지 않는다 — 그 헬퍼는 단일 키 컬럼(hpid/ykiho)만 받는데 이 테이블은
 * (ykiho, sno) 복합키다. 그래서 raw SQL 을 그대로 둔다. 서비스는 원본 호출·파싱·필터·정합성
 * 판단만 하고 SQL 은 만지지 않는다.
 */
@Injectable()
export class HiraNpaySyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** (ykiho, sno) 로 벌크 upsert. 처리한 행 수를 반환한다. */
  async upsertMirror(
    rows: (NonPaymentDetailItem & { ykiho: string; sno: number })[],
  ): Promise<number> {
    let processed = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);

      // JSON 으로 캐스팅해서 넣는다. 문자열로 두면 아래 비교(data = new.data)가 항상 거짓이 된다.
      const values = Prisma.join(
        chunk.map(
          (row) =>
            Prisma.sql`(${row.ykiho}, ${row.sno}, CAST(${JSON.stringify(row)} AS JSON), NOW(), NOW(), NOW())`,
        ),
      );

      // updated_at 은 data 가 실제로 바뀐 경우에만 갱신한다. SET 절이 왼쪽부터 평가되므로
      // data 대입보다 앞에 둬야 비교 시점의 data 가 옛 값이다. (common/mirror-upsert.ts 와 같은 이유)
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO hira_hospital_npay (ykiho, sno, data, created_at, updated_at, synced_at)
          VALUES ${values} AS new
          ON DUPLICATE KEY UPDATE
            updated_at = IF(hira_hospital_npay.data = new.data, hira_hospital_npay.updated_at, NOW()),
            synced_at  = NOW(),
            data       = new.data
        `,
      );

      processed += chunk.length;
    }

    return processed;
  }

  /** 이번 전수에 없던 행 = 원본에서 사라진 항목. 병원이 비급여 항목을 내리면 여기로 떨어진다. */
  async deleteStale(startedAt: Date): Promise<number> {
    const { count } = await this.prisma.hiraHospitalNpay.deleteMany({
      where: { syncedAt: { lt: startedAt } },
    });
    return count;
  }
}
