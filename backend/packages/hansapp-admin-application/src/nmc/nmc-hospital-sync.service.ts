import { Inject, Injectable, Logger } from '@nestjs/common';
import type { HospitalFullDownItem, NmcClient } from '@krdata/nmc';

import { NmcHospitalSyncRepository } from './nmc-hospital-sync.repository';
import { NMC_CLIENT } from '../krdata.providers';
import { resolveSyncOptions, SyncOptions, SyncResult } from '../common/sync.types';

/**
 * NMC 병원 목록을 로컬 DB(nmc_hospital)에 미러링한다.
 *
 * 출처는 FullData 내려받기(getHsptlMdcncFullDown)다. 필터가 없어 전체를 그대로 받는다.
 * 응답 item 을 가공하지 않고 JSON 컬럼에 통째로 넣는다.
 */
@Injectable()
export class NmcHospitalSyncService {
  private readonly logger = new Logger(NmcHospitalSyncService.name);

  constructor(
    private readonly repo: NmcHospitalSyncRepository,
    @Inject(NMC_CLIENT) private readonly client: NmcClient,
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
      const response = await this.client.getHospitalFullDown({
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
        `NMC 병원 page=${currentPage} rows=${items.length} 누적=${fetched}/${totalCount}`,
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
    this.logger.log(`NMC 지역 갱신: 시도 ${regions.sidos}종 / 시군구 조합 ${regions.regions}건`);

    return {
      totalCount,
      fetched,
      upserted,
      pages,
      regions: regions.regions,
      elapsedMs: Date.now() - startedAt,
    };
  }

  /** hpid 가 없는 항목은 PK 를 만들 수 없으므로 건너뛴다. */
  private async upsert(items: HospitalFullDownItem[]): Promise<number> {
    const rows = items
      .filter((item) => typeof item.hpid === 'string' && item.hpid.length > 0)
      .map((item) => ({ key: item.hpid as string, data: item }));

    const skipped = items.length - rows.length;
    if (skipped > 0) {
      this.logger.warn(`hpid 가 없어 건너뛴 항목 ${skipped}건`);
    }

    return this.repo.upsertMirror(rows);
  }
}
