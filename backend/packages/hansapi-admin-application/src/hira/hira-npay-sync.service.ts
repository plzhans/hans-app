import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapi/data';
import type { HiraClient, NonPaymentDetailItem } from '@krdata/hira';

import { SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';

/**
 * 259,353건이라 130장이면 끝난다.
 *
 * 병원목록(DEFAULT_SYNC_ROWS)은 10,000 을 쓰지만 여긴 2,000 이다. 한 행이 무거워서
 * 2,000 건에 이미 1MB·11~17초다(2026-07 실측). 더 키우면 응답이 커지는 만큼 느려지고,
 * 25MB(50,000건)를 연달아 던졌더니 그 뒤로 작은 요청까지 한동안 504 가 났다.
 * 잠시 쉬면 회복되지만, 배치가 그 상태에 빠지면 페이지마다 재시도가 붙어 더 오래 걸린다.
 */
const PAGE_SIZE = 2_000;

/** 한 번의 INSERT 에 담을 행 수. 너무 크면 max_allowed_packet 에 걸린다. */
const CHUNK_SIZE = 500;

/**
 * HIRA 비급여 진료비를 로컬 DB(hira_hospital_npay)에 미러링한다.
 *
 * 출처는 비급여진료비정보조회서비스의 **상세**(getNonPaymentItemHospDtlList)다. 요약(List2)이
 * 아니다 — 성격이 반대라 섞으면 안 된다(clients/krdata-hira/README.md 참고).
 * ykiho 가 옵션이라 **빼고 부르면 목록형**이 된다. 전수 259,353건이 130콜에 나온다.
 *
 * **병원급 이상만 나온다.** 의원(clCd=31)은 이 API 에 없다.
 *
 * upsertMirrorRows 를 쓰지 않는다 — 그 헬퍼는 단일 키 컬럼(hpid/ykiho)만 받는데 이 테이블은
 * (ykiho, sno) 복합키다. hira_hospital_detail 이 같은 이유로 자기 INSERT 를 직접 쓴다.
 */
@Injectable()
export class HiraNpaySyncService {
  private readonly logger = new Logger(HiraNpaySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    // 삭제 기준선. 이 시각보다 synced_at 이 오래된 행 = 이번 전수에 없던 행이다.
    // **첫 페이지를 받기 전에 찍어야 한다** — 순회 중에 찍으면 이미 upsert 된 행이 기준선보다
    // 앞서서, 살아 있는 행을 지운다.
    const startedAt = new Date();

    let totalCount = 0;
    let fetched = 0;
    let upserted = 0;
    let calls = 0;

    for await (const response of this.client.paginateNonPaymentDetails(
      PAGE_SIZE,
    )) {
      const body = response.response?.body;
      const items = body?.items?.item ?? [];
      totalCount = body?.totalCount ?? 0;
      calls += 1;

      upserted += await this.upsert(items);
      fetched += items.length;

      this.logger.log(
        `HIRA 비급여 ${fetched.toLocaleString()}/${totalCount.toLocaleString()}`,
      );
    }

    // 전수를 다 받은 뒤에만 지운다. 중간에 실패해서 일부만 받았다면 살아 있는 행을 대량으로
    // 지우게 되므로, 순회가 끝까지 갔을 때(= for await 가 정상 종료) 여기 도달하는 것에 의존한다.
    const deleted = await this.deleteStale(startedAt);
    if (deleted > 0) {
      this.logger.log(
        `원본에서 사라진 비급여 ${deleted.toLocaleString()}건 삭제`,
      );
    }

    return { total: totalCount, processed: upserted, calls };
  }

  /**
   * (ykiho, sno) 로 upsert 한다.
   *
   * sno 는 심평원이 매긴 순번이라 재부여될 수 있다. 그래도 어긋나지 않는 이유는 전수를 새로
   * 받고 남은 행을 deleteStale 이 지우기 때문이다 — 증분 갱신을 하지 않는다.
   */
  private async upsert(items: NonPaymentDetailItem[]): Promise<number> {
    const rows = items.filter(
      (item): item is NonPaymentDetailItem & { ykiho: string; sno: number } =>
        typeof item.ykiho === 'string' &&
        item.ykiho.length > 0 &&
        typeof item.sno === 'number',
    );

    const skipped = items.length - rows.length;
    if (skipped > 0) {
      // PK 를 만들 수 없는 항목이다. 조용히 넘어가면 건수가 안 맞는 이유를 못 찾는다.
      this.logger.warn(`ykiho/sno 가 없어 건너뛴 항목 ${skipped}건`);
    }

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
  private async deleteStale(startedAt: Date): Promise<number> {
    const { count } = await this.prisma.hira_hospital_npay.deleteMany({
      where: { synced_at: { lt: startedAt } },
    });
    return count;
  }
}
