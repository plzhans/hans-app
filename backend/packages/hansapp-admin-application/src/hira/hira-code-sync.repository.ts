import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import { CodeRow, upsertCodeRows } from '../common/code-upsert';

const KEY_COLUMNS = ['tp', 'cd'] as const;
const VALUE_COLUMNS = ['tp_nm', 'cd_nm', 'cd_cmt'] as const;

/**
 * HIRA 코드 미러 저장소. 코드 벌크 upsert 만 담당한다.
 *
 * 벌크 SQL 자체는 공용 헬퍼(code-upsert)에 있고, hira_code 의 키·값 컬럼 구성이 여기 있다.
 * prisma 를 물려 **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다 —
 * 서비스는 원본 호출·파싱·행 가공에만 집중한다.
 */
@Injectable()
export class HiraCodeSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** hira_code 에 (tp, cd) 키로 벌크 upsert. 처리한 행 수를 반환한다. */
  upsertCodes(rows: CodeRow[]): Promise<number> {
    return upsertCodeRows(this.prisma, 'hira_code', KEY_COLUMNS, VALUE_COLUMNS, rows);
  }
}
