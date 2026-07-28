import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';
import type { NpayWebRecord } from '@hansapp/application';

import { NpayCodeRow, upsertNpayCodes } from './hira-npay-code.upsert';

/** hira_hospital_detail 의 op. 이것만 출처가 공개 API 가 아니다. */
const OP = 'npay-web';

/**
 * HIRA 홈페이지 비급여 저장소. 크롤 결과 적재(hira_hospital_detail)와 코드마스터 보완을 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다. 서비스는 큐 처리·크롤·파싱·모양 검증만 하고 SQL 은 만지지 않는다.
 */
@Injectable()
export class HiraNpayWebSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 크롤 결과를 hira_hospital_detail(op='npay-web')에 upsert 한다. */
  async storeDetail(ykiho: string, record: NpayWebRecord): Promise<void> {
    // JSON 으로 캐스팅해서 넣는다. 문자열로 두면 아래 비교(data = new.data)가 항상 거짓이 된다.
    // updated_at 은 data 가 실제로 바뀐 경우에만 갱신한다 — SET 절이 왼쪽부터 평가되므로
    // data 대입보다 앞에 둬야 비교 시점의 data 가 옛 값이다. (common/mirror-upsert.ts 와 같은 이유)
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO hira_hospital_detail (ykiho, op, data, created_at, updated_at, synced_at)
      VALUES (${ykiho}, ${OP}, CAST(${JSON.stringify(record)} AS JSON), NOW(), NOW(), NOW()) AS new
      ON DUPLICATE KEY UPDATE
        updated_at = IF(hira_hospital_detail.data = new.data, hira_hospital_detail.updated_at, NOW()),
        synced_at  = NOW(),
        data       = new.data
    `);
  }

  /**
   * 비급여 코드마스터를 보완한다. 크롤 응답엔 분류코드가 다 있으니 요약(List2)에 없는 의원 전용
   * 코드가 여기서 채워진다. 분류코드는 upsert 가 '있을 때만' 갱신하므로 요약이 먼저 채운 값을 안 덮는다.
   */
  upsertCodes(rows: NpayCodeRow[]): Promise<number> {
    return upsertNpayCodes(this.prisma, rows);
  }
}
