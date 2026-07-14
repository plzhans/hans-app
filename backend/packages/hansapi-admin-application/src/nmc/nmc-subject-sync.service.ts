import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapi/application';
import { PrismaService } from '@hansapi/data';
import type { NmcClient } from '@krdata/nmc';
import { Prisma } from '@prisma/client';

import { NMC_CLIENT } from '../krdata.providers';
import { SyncOutcome } from './../common/sync-state.service';

/** 한 페이지에 받을 병원 수. 과목별 병원이 최대 2만여 건이다. */
const PAGE_SIZE = 10_000;

/** 한 번의 INSERT 에 담을 행 수 */
const CHUNK_SIZE = 1_000;

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
    private readonly prisma: PrismaService,
    @Inject(NMC_CLIENT) private readonly client: NmcClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    const subjects = await this.prisma.nmc_code.findMany({
      where: { cm_mid: 'D000' },
      orderBy: { cm_sid: 'asc' },
      select: { cm_sid: true, cm_snm: true },
    });

    let calls = 0;
    let processed = 0;

    for (const subject of subjects) {
      const code = subject.cm_sid;
      const name = subject.cm_snm;

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

        processed += await this.upsert(hpids, code, name);
        fetched += items.length;

        if (fetched >= totalCount) {
          break;
        }
        pageNo += 1;
      }

      this.logger.log(
        `NMC 진료과목 ${code}(${name ?? '?'}) 병원 ${fetched.toLocaleString()}건`,
      );
    }

    return { total: subjects.length, processed, calls };
  }

  /**
   * 역조회 결과를 적재한다. source='list' 로 남긴다.
   *
   * 나중에 basic(dgidIdName)이 같은 키를 source='basic' 으로 덮어쓴다.
   * 이미 basic 으로 채워진 행을 역조회가 되돌리지 않도록, source 가 'basic' 이면 건드리지 않는다.
   */
  private async upsert(
    hpids: string[],
    subjectCd: string,
    subjectNm: string | null,
  ): Promise<number> {
    for (let i = 0; i < hpids.length; i += CHUNK_SIZE) {
      const chunk = hpids.slice(i, i + CHUNK_SIZE);

      const values = Prisma.join(
        chunk.map(
          (hpid) =>
            Prisma.sql`(${hpid}, ${subjectCd}, ${subjectNm}, 'list', NOW())`,
        ),
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO nmc_hospital_subject
            (hpid, subject_cd, subject_nm, source, synced_at)
          VALUES ${values} AS new
          ON DUPLICATE KEY UPDATE
            subject_nm = new.subject_nm,
            source     = IF(nmc_hospital_subject.source = 'basic', 'basic', new.source),
            synced_at  = NOW()
        `,
      );
    }

    return hpids.length;
  }
}
