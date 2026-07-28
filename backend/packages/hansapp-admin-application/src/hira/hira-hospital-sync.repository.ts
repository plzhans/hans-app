import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import { upsertMirrorRows, type MirrorRow } from '../common/mirror-upsert';
import { rebuildHiraRegions } from '../common/region-rebuild';

/**
 * HIRA 병원 미러 저장소. 적재(mirror upsert)와 지역 집계 재생성만 담당한다.
 *
 * 벌크 SQL 자체는 공용 헬퍼(mirror-upsert·region-rebuild)에 있다. 이 리포는 prisma 를 물려
 * **서비스가 prisma 를 직접 만지지 않게** 하는 얇은 경계다 — 서비스는 적재(fetch·가공)에만 집중한다.
 */
@Injectable()
export class HiraHospitalSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** hira_hospital 에 ykiho 키로 벌크 upsert. 처리한 행 수를 반환한다. */
  upsertMirror(rows: MirrorRow[]): Promise<number> {
    return upsertMirrorRows(this.prisma, 'hira_hospital', 'ykiho', rows);
  }

  /** 병원 데이터에서 지역 집계(hira_region)를 다시 만든다. */
  rebuildRegions() {
    return rebuildHiraRegions(this.prisma);
  }
}
