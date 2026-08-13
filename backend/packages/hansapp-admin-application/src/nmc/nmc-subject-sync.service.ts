import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapp/application';
import type { NmcClient } from '@krdata/nmc';

import { NmcSubjectSyncRepository } from './nmc-subject-sync.repository';
import { NMC_CLIENT } from '../krdata.providers';
import { SyncOutcome } from './../common/sync-state.service';

/** 한 페이지에 받을 병원 수. 과목별 병원이 최대 2만여 건이다. */
const PAGE_SIZE = 10_000;

/**
 * NMC 병원-진료과목 매핑을 만든다. **역조회**로 만든다.
 *
 * 병원별로 basic(dgidIdName)을 부르면 78,631콜이다. 그런데 병원 목록에 진료과목 필터(QD)가
 * 있어서 **과목별로 뒤집어 조회하면 ~50콜**이면 끝난다. 1,500배 차이다.
 *
 * 과목 목록은 코드마스터(D000)에서 가져온다. 코드가 늘어도 코드를 다시 적을 필요가 없다.
 */
@Injectable()
export class NmcSubjectSyncService {
  private readonly logger = new Logger(NmcSubjectSyncService.name);

  constructor(
    private readonly repo: NmcSubjectSyncRepository,
    @Inject(NMC_CLIENT) private readonly client: NmcClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    const subjects = await this.repo.findSubjects();

    let calls = 0;
    let processed = 0;

    for (const subject of subjects) {
      const code = subject.cmSid;
      const name = subject.cmSnm;

      let pageNo = 1;
      let fetched = 0;
      let totalCount = 0;

      for (;;) {
        const response = await this.client.getHospitalList({
          QD: code,
          pageNo,
          numOfRows: PAGE_SIZE,
        });
        calls += 1;

        const body = response.response?.body;
        const items = body?.items?.item ?? [];
        totalCount = body?.totalCount ?? 0;

        if (items.length === 0) {
          break;
        }

        const hpids = items
          .map((item) => asString(item.hpid))
          .filter((hpid): hpid is string => hpid !== null);

        processed += await this.repo.upsertLinks(hpids, code, name);
        fetched += items.length;

        if (fetched >= totalCount) {
          break;
        }
        pageNo += 1;
      }

      this.logger.log(`NMC 진료과목 ${code}(${name ?? '?'}) 병원 ${fetched.toLocaleString()}건`);
    }

    return { total: subjects.length, processed, calls };
  }
}
