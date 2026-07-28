import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapp/application';
import type { HiraClient } from '@krdata/hira';

import { HiraSubjectSyncRepository } from './hira-subject-sync.repository';
import { SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';

/** 한 페이지에 받을 병원 수. 내과는 23,768건이라 페이징이 필요하다. */
const PAGE_SIZE = 10_000;

/**
 * HIRA 병원-진료과목 매핑을 만든다. **역조회**로 만든다.
 *
 * 병원별로 getSubjectInfo(ykiho)를 부르면 79,739콜이다. 병원 목록에 진료과목 필터(dgsbjtCd)가
 * 있어서 **과목별로 뒤집어 조회하면 ~94콜**이다. 850배 차이다.
 *
 * 단건 API 가 추가로 주는 것은 과목별 전문의수 하나뿐이다. 그거 하나에 8만 콜을 쓰지 않는다.
 * 전문의수 컬럼(sdr_cnt)은 열어두고 NULL 로 남긴다. 나중에 받기로 하면 그때 채운다.
 */
@Injectable()
export class HiraSubjectSyncService {
  private readonly logger = new Logger(HiraSubjectSyncService.name);

  constructor(
    private readonly repo: HiraSubjectSyncRepository,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    const subjects = await this.repo.findSubjectCodes();

    let calls = 0;
    let processed = 0;

    for (const subject of subjects) {
      const code = subject.cd;
      const name = subject.cdNm;

      let pageNo = 1;
      let fetched = 0;
      let totalCount = 0;

      for (;;) {
        const response = await this.client.getHospitalList({
          dgsbjtCd: code,
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

        const ykihos = items
          .map((item) => asString(item.ykiho))
          .filter((ykiho): ykiho is string => ykiho !== null);

        processed += await this.upsert(ykihos, code, name);
        fetched += items.length;

        if (fetched >= totalCount) {
          break;
        }
        pageNo += 1;
      }

      this.logger.log(
        `HIRA 진료과목 ${code}(${name ?? '?'}) 병원 ${fetched.toLocaleString()}건`,
      );
    }

    return { total: subjects.length, processed, calls };
  }

  /**
   * source='list' 로 적재한다. 나중에 getSubjectInfo 가 전문의수까지 채우며 덮어쓴다.
   * 이미 'subject' 로 채워진 행은 역조회가 되돌리지 않는다(전문의수를 날리지 않기 위해).
   */
  private async upsert(
    ykihos: string[],
    dgsbjtCd: string,
    dgsbjtNm: string | null,
  ): Promise<number> {
    await this.repo.upsertSubjects(ykihos, dgsbjtCd, dgsbjtNm);

    return ykihos.length;
  }
}
