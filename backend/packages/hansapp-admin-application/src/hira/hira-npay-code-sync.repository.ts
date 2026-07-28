import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import { NpayCodeRow, upsertNpayCodes } from './hira-npay-code.upsert';

/**
 * HIRA 비급여 코드마스터 저장소. 코드 벌크 upsert 만 담당한다.
 *
 * 벌크 SQL 자체는 공용 헬퍼(hira-npay-code.upsert)에 있다 — 요약 sync 와 크롤 적재가 함께 쓴다.
 * prisma 를 물려 **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다 —
 * 서비스는 페이징·dedup 에만 집중한다.
 */
@Injectable()
export class HiraNpayCodeSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** hira_npay_code 에 벌크 upsert. 처리한 행 수를 반환한다. */
  upsertCodes(rows: NpayCodeRow[]): Promise<number> {
    return upsertNpayCodes(this.prisma, rows);
  }
}
