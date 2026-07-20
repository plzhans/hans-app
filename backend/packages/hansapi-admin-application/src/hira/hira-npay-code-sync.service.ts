import { Inject, Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapi/application';
import { PrismaService } from '@hansapi/data';
import type { HiraClient, NonPaymentSummaryItem } from '@krdata/hira';

import { SyncOutcome } from '../common/sync-state.service';
import { HIRA_CLIENT } from '../krdata.providers';
import { NpayCodeRow, upsertNpayCodes } from './hira-npay-code.upsert';

/**
 * 요약은 전건 187,627건이다. **500건/페이지로 잘게 받는다** — 심평원 API 가 flaky 해서
 * 1,000건은 한 페이지가 통째로 타임아웃날 때가 있다(상세 sync 도 같은 이유로 크기를 낮춘다).
 */
const PAGE_SIZE = 500;

/**
 * HIRA 비급여 항목 코드마스터(hira_npay_code)를 채운다.
 *
 * **출처는 요약(getNonPaymentItemHospList2)이다.** 상세(Dtl)엔 npayCd 뿐이라 분류코드가 없고,
 * 통계·코드목록은 npayCd+이름만 준다. 분류코드(중분류·소분류)까지 주는 건 요약뿐이다.
 *
 * **전량 페이징한다.** 요약은 병원별이라 187,627행이지만 distinct npayCd 는 655 안팎이다 —
 * 같은 코드가 수백 번 반복된다. 그래도 전량을 훑는 이유는, 조기 중단하면 맨 뒤에만 나오는 희귀
 * 코드를 놓치기 때문이다. 코드마스터는 거의 안 바뀌므로 이 sync 는 스케줄로 저빈도(예: 일 1회)로 돈다.
 *
 * **관측된 코드만 쌓는다**(region_code 와 같은 방식) — 죽은 항목이 안 생긴다. 요약에 없는
 * 의원 전용 코드는 크롤 적재(HiraNpayWebSyncService)가 채운다.
 */
@Injectable()
export class HiraNpayCodeSyncService {
  private readonly logger = new Logger(HiraNpayCodeSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(HIRA_CLIENT) private readonly client: HiraClient,
  ) {}

  async sync(): Promise<SyncOutcome> {
    // 같은 npayCd 가 수백 번 반복되므로 메모리에서 dedup 한 뒤 한 번만 upsert 한다.
    const codes = new Map<string, NpayCodeRow>();
    let calls = 0;
    let scanned = 0;

    // **페이징이 중간에 실패해도 그때까지 모은 걸 적재한다.** 심평원 API 가 flaky 해서 188콜을
    // 매번 완주하지 못한다 — 한 페이지가 타임아웃나면 여기서 멈추고 아래 upsert 로 넘어간다.
    // 코드는 대부분 앞 페이지에 나오므로(distinct 655) 뒤가 끊겨도 실질 누락은 적고, 남은 건
    // 다음 스케줄 실행이나 크롤 적재가 채운다.
    try {
      for await (const response of this.client.paginateNonPaymentSummaries(
        PAGE_SIZE,
      )) {
        const items = response.response?.body?.items?.item ?? [];
        calls += 1;
        scanned += items.length;

        for (const item of items) {
          const row = toRow(item);
          // 분류코드가 있는 행을 우선한다 — 같은 코드가 분류 없는 행으로 먼저 들어왔으면 덮어쓴다.
          if (row && (!codes.has(row.cd) || row.mdivCd)) {
            codes.set(row.cd, row);
          }
        }

        this.logger.log(
          `HIRA 비급여코드 스캔 ${scanned.toLocaleString()}행 / 코드 ${codes.size}종`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `요약 페이징이 ${calls}콜에서 끊겼다(${message}). 지금까지 모은 ${codes.size}종으로 적재한다.`,
      );
    }

    const upserted = await upsertNpayCodes(this.prisma, [...codes.values()]);
    return { total: codes.size, processed: upserted, calls };
  }
}

/** 요약 item → 코드 사전 행. npayCd 가 없으면(PK 불가) 버린다. */
function toRow(item: NonPaymentSummaryItem): NpayCodeRow | null {
  const cd = asString(item.npayCd);
  const cdNm = asString(item.npayKorNm);
  if (!cd || !cdNm) {
    return null;
  }
  return {
    cd,
    cdNm,
    sdivCd: asString(item.npaySdivCd),
    sdivNm: asString(item.npaySdivCdNm),
    mdivCd: asString(item.npayMdivCd),
    mdivNm: asString(item.npayMdivCdNm),
  };
}
