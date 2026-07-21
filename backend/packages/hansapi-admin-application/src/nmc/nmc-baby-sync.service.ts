import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapi/application';
// 달빛 목록은 병원 목록과 같은 item 타입을 쓴다(스펙이 그렇게 정의돼 있다).
import type { HospitalListItem, NmcClient } from '@krdata/nmc';

import { NmcBabySyncRepository } from './nmc-baby-sync.repository';
import { SyncOutcome } from '../common/sync-state.service';
import { NMC_CLIENT } from '../krdata.providers';

/** 전국 153건뿐이라 한 번에 다 받는다. */
const PAGE_SIZE = 1_000;

/**
 * 달빛어린이병원·소아전문센터를 적재한다. 필터를 주지 않으면 전체가 1콜에 온다.
 *
 * 병원 목록의 부분집합이지만 원본이 별도 API 라 테이블을 나눈다.
 * 야간·휴일 소아 진료라는 성격이 뚜렷해 검색에서 독립적으로 쓰인다.
 */
@Injectable()
export class NmcBabySyncService {
  private readonly logger = new Logger(NmcBabySyncService.name);

  constructor(
    private readonly repo: NmcBabySyncRepository,
    @Inject(NMC_CLIENT) private readonly client: NmcClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    const response = await this.client.getBabyHospitalList({
      pageNo: 1,
      numOfRows: PAGE_SIZE,
    });

    const body = response.response?.body;
    const items: HospitalListItem[] = body?.items?.item ?? [];
    const totalCount = body?.totalCount ?? 0;

    const rows = items
      .map((item) => ({ key: asString(item.hpid), data: item }))
      .filter((row): row is { key: string; data: HospitalListItem } =>
        Boolean(row.key),
      );

    const processed = await this.repo.upsertMirror(rows);

    this.logger.log(`NMC 달빛어린이병원 ${processed}건 적재`);

    if (totalCount > items.length) {
      this.logger.warn(
        `전체 ${totalCount}건 중 ${items.length}건만 받았다. PAGE_SIZE 를 늘려야 한다.`,
      );
    }

    return { total: totalCount, processed, calls: 1 };
  }
}
