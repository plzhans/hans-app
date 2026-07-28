import { Inject, Injectable, Logger } from '@nestjs/common';
import type { HiraClient, HospitalAssessmentItem } from '@krdata/hira';

import { HiraAssessmentSyncRepository } from './hira-assessment-sync.repository';
import { SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';

/** 36,599건이라 37장이면 끝난다. */
const PAGE_SIZE = 1_000;

/**
 * HIRA 병원평가 등급을 로컬 DB(hira_hospital_asm)에 미러링한다.
 *
 * 출처는 병원평가정보서비스(hospAsmInfoService1/getHospAsmInfo)다. ykiho 가 옵션이라
 * **빼고 부르면 목록형**이 된다. 전수 36,599건이 37콜에 나온다 — 병원마다 부를 이유가 없다.
 *
 * 응답 item 을 가공하지 않고 JSON 컬럼에 통째로 넣는다. 평가항목이 asmGrd01~24 로 가로로
 * 붙는데(02·11 은 없다) 항목마다 값 도메인이 달라서 — asmGrd16(천식)만 0·2~5·'양호' 를
 * 쓰고 나머지는 1~5·'등급제외' 를 쓴다 — 섣불리 펼치면 원본을 잃는다.
 * 등급으로 필터링이 필요해지면 그때 JSON 에서 뽑는다.
 */
@Injectable()
export class HiraAssessmentSyncService {
  private readonly logger = new Logger(HiraAssessmentSyncService.name);

  constructor(
    private readonly repo: HiraAssessmentSyncRepository,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    let totalCount = 0;
    let fetched = 0;
    let upserted = 0;
    let calls = 0;

    for await (const response of this.client.paginateHospitalAssessments(
      PAGE_SIZE,
    )) {
      const body = response.response?.body;
      const items = body?.items?.item ?? [];
      totalCount = body?.totalCount ?? 0;
      calls += 1;

      upserted += await this.upsert(items);
      fetched += items.length;

      this.logger.log(
        `HIRA 병원평가 ${fetched.toLocaleString()}/${totalCount.toLocaleString()}`,
      );
    }

    return { total: totalCount, processed: upserted, calls };
  }

  /** ykiho 가 없는 항목은 PK 를 만들 수 없으므로 건너뛴다. */
  private async upsert(items: HospitalAssessmentItem[]): Promise<number> {
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
