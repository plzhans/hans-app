import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapp/application';
import type { HiraClient } from '@krdata/hira';

import { HiraSpecialtySyncRepository } from './hira-specialty-sync.repository';
import { SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';

/** 전문병원은 분야당 100건도 안 된다. 한 장이면 끝난다. */
const PAGE_SIZE = 1_000;

/**
 * HIRA 병원-전문병원지정분야 매핑을 만든다. **역조회**로 만든다.
 *
 * 병원별로 getSpecialtyHospitalFields(ykiho)를 부르면 병원급만 4,231콜, 의원급까지면
 * 79,739콜이다. 전문병원 목록에 분야 필터(srchCd)가 있어서 **분야별로 뒤집어 조회하면
 * 19콜**이다. 진료과목 역조회(HiraSubjectSyncService)와 같은 논리다.
 *
 * 개별 조회는 콜이 비싼 게 문제가 아니라 **끝나지를 않았다.** 병원급 4,231개를 다 돌려본
 * 적이 없어 전문병원 데이터가 늘 부분이었다. 역조회는 19콜에 전수가 나온다.
 *
 * 전문병원 지정은 병원급 이상만 받는다(의료법상 대상이 병원·종합병원·치과병원·한방병원).
 * 즉 의원급 75,508개에 대한 개별 조회는 전부 0건 응답을 받으려고 쓰는 콜이었다.
 *
 * **응답에 srchCd 가 없다.** 어느 분야인지는 응답이 아니라 요청 필터가 정한다.
 * 그래서 코드를 돌며 부르고, 분야는 루프 변수에서 얻는다.
 */
@Injectable()
export class HiraSpecialtySyncService {
  private readonly logger = new Logger(HiraSpecialtySyncService.name);

  constructor(
    private readonly repo: HiraSpecialtySyncRepository,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    const codes = await this.repo.findSpecialtyCodes();

    if (codes.length === 0) {
      // 코드가 없으면 돌 축이 없다. 1단계의 코드 동기화가 먼저다.
      this.logger.warn(
        'HIRA 전문병원코드가 비어 있다. 코드 동기화(1단계 1/4)가 먼저다.',
      );
      return { total: 0, processed: 0, calls: 0 };
    }

    // 이 시각보다 오래된 specialty 행은 이번 전수에 없었다는 뜻이다. 아래에서 지운다.
    //
    // **DB 시각을 쓴다.** synced_at 은 DateTime(0) 이라 NOW() 가 초 단위로 절삭돼 들어간다.
    // JS 의 new Date() 로 잡으면 밀리초가 붙어(12:00:00.500), 같은 초에 넣은 행
    // (synced_at=12:00:00)이 워터마크보다 "과거"가 돼 **방금 넣은 것이 지워진다.**
    // 앱과 DB 의 시계 오차도 같은 이유로 위험하다.
    const startedAt = await this.repo.now();

    let calls = 0;
    let processed = 0;

    for (const { cd, cdNm: name } of codes) {
      let pageNo = 1;
      let fetched = 0;

      for (;;) {
        const response = await this.client.getSpecialtyHospitals({
          srchCd: cd,
          pageNo,
          numOfRows: PAGE_SIZE,
        });
        calls += 1;

        const body = response.response?.body;
        const items = body?.items?.item ?? [];
        if (items.length === 0) {
          break;
        }

        const ykihos = items
          .map((item) => asString(item.ykiho))
          .filter((ykiho): ykiho is string => ykiho !== null);

        processed += await this.upsert(ykihos, cd, name);
        fetched += items.length;

        if (fetched >= (body?.totalCount ?? 0)) {
          break;
        }
        pageNo += 1;
      }

      this.logger.log(
        `HIRA 전문병원 ${cd}(${name ?? '?'}) ${fetched.toLocaleString()}건`,
      );
    }

    await this.removeStale(startedAt);

    return { total: codes.length, processed, calls };
  }

  /**
   * 분야는 루프 변수(srchCd)가 정한다. 응답에는 없다.
   * srch_nm 은 hira_code 에서 가져온다 — 목록 API 가 코드명을 주지 않는다.
   */
  private async upsert(
    ykihos: string[],
    srchCd: string,
    srchNm: string | null,
  ): Promise<number> {
    if (ykihos.length === 0) {
      return 0;
    }

    await this.repo.upsertSrch(ykihos, srchCd, srchNm);

    return ykihos.length;
  }

  /**
   * 이번 전수에 없던 specialty 행을 지운다. 전문병원 지정은 3년 주기라 탈락하는 곳이 있고,
   * upsert 만 하면 탈락한 기관이 영영 남는다.
   *
   * **전수를 받은 뒤에만 안전하다.** 중간에 끊긴 실행에서 지우면 멀쩡한 데이터가 날아간다.
   * 이 서비스는 19콜짜리라 부분 실패 시 예외로 죽고 여기까지 오지 않는다 —
   * 한도 초과를 오퍼레이션별로 견디는 개별 조회(HiraDetailSyncService)와 다른 점이다.
   *
   * tp='specialty' 만 건드린다. special(특수진료)은 여전히 개별 조회 소관이다.
   */
  private async removeStale(startedAt: Date): Promise<number> {
    const removed = await this.repo.removeStale(startedAt);

    if (removed > 0) {
      this.logger.log(
        `HIRA 전문병원 지정 해제 ${removed.toLocaleString()}건 정리`,
      );
    }
    return removed;
  }
}
