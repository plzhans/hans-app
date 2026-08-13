import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import { CodeRow, upsertCodeRows } from '../common/code-upsert';

const KEY_COLUMNS = ['cm_mid', 'cm_sid'] as const;
const VALUE_COLUMNS = ['cm_mnm', 'cm_snm'] as const;

/**
 * NMC 코드마스터 미러 저장소. 코드 벌크 upsert 만 담당한다.
 *
 * 벌크 SQL 자체는 공용 헬퍼(code-upsert)에 있다. 이 리포는 prisma 를 물려
 * **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다 — 서비스는 적재(fetch·가공)에만 집중한다.
 */
@Injectable()
export class NmcCodeSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** nmc_code 에 대·소분류 코드를 키로 벌크 upsert. 처리한 행 수를 반환한다. */
  upsertCodes(rows: CodeRow[]): Promise<number> {
    return upsertCodeRows(this.prisma, 'nmc_code', KEY_COLUMNS, VALUE_COLUMNS, rows);
  }
}
