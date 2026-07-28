import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import { upsertMirrorRows, type MirrorRow } from '../common/mirror-upsert';

/**
 * NMC 달빛어린이병원 미러 저장소. 적재(mirror upsert)만 담당한다.
 *
 * 벌크 SQL 자체는 공용 헬퍼(mirror-upsert)에 있다. 이 리포는 prisma 를 물려
 * **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다 — 서비스는 적재(fetch·가공)에만 집중한다.
 */
@Injectable()
export class NmcBabySyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** nmc_baby_hospital 에 hpid 키로 벌크 upsert. 처리한 행 수를 반환한다. */
  upsertMirror(rows: MirrorRow[]): Promise<number> {
    return upsertMirrorRows(this.prisma, 'nmc_baby_hospital', 'hpid', rows);
  }
}
