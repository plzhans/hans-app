import { Inject, Injectable, Logger } from '@nestjs/common';
import type { HiraClient, HospitalItem } from '@krdata/hira';

import { HiraHospitalSyncRepository } from './hira-hospital-sync.repository';
import { HIRA_CLIENT } from '../krdata.providers';
import { resolveSyncOptions, SyncOptions, SyncResult } from '../common/sync.types';

/**
 * HIRA 병원 목록을 로컬 DB(hira_hospital)에 미러링한다.
 *
 * 출처는 병원 기본목록(hospInfoServicev2/getHospBasisList)이다.
 * 응답 item 을 가공하지 않고 JSON 컬럼에 통째로 넣는다. ykiho 가 PK 이며 상세 조회의 키이기도 하다.
 */
@Injectable()
export class HiraHospitalSyncService {
  private readonly logger = new Logger(HiraHospitalSyncService.name);

  constructor(
    private readonly repo: HiraHospitalSyncRepository,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const { full, pageNo, numOfRows } = resolveSyncOptions(options);
    const startedAt = Date.now();

    let totalCount = 0;
    let fetched = 0;
    let upserted = 0;
    let pages = 0;

    let currentPage = full ? 1 : pageNo;

    for (;;) {
      const response = await this.client.getHospitalList({
        pageNo: currentPage,
        numOfRows,
      });

      const body = response.response?.body;
      const items = body?.items?.item ?? [];
      totalCount = body?.totalCount ?? 0;
      pages += 1;

      if (items.length === 0) {
        break;
      }

      upserted += await this.upsert(items);
      fetched += items.length;

      this.logger.log(
        `HIRA 병원 page=${currentPage} rows=${items.length} 누적=${fetched}/${totalCount}`,
      );

      if (!full) {
        break;
      }
      if (fetched >= totalCount) {
        break;
      }
      currentPage += 1;
    }

    // 지역 목록은 병원 데이터의 집계다. 적재가 끝났으니 다시 만든다.
    const regions = await this.repo.rebuildRegions();
    this.logger.log(`HIRA 지역 갱신: 시도 ${regions.sidos}종 / 시군구 조합 ${regions.regions}건`);

    return {
      totalCount,
      fetched,
      upserted,
      pages,
      regions: regions.regions,
      elapsedMs: Date.now() - startedAt,
    };
  }

  /** ykiho 가 없는 항목은 PK 를 만들 수 없으므로 건너뛴다. */
  private async upsert(items: HospitalItem[]): Promise<number> {
    const rows = items
      .filter((item) => typeof item.ykiho === 'string' && item.ykiho.length > 0)
      .map((item) => ({ key: item.ykiho as string, data: item }));

    const skipped = items.length - rows.length;
    if (skipped > 0) {
      this.logger.warn(`ykiho 가 없어 건너뛴 항목 ${skipped}건`);
    }

    return this.repo.upsertMirror(rows);
  }
}
